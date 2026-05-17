// ========================================
// bot/utils/database.js - DatabasePool générique (async/await, pool-ready)
// ========================================

import path from "path";
import { fileURLToPath } from "url";
import logger from "../../shared/logging/logger.js";
import appState from "../../core/services/AppState.js";
import { retryDatabase } from "../shared/retry.js";

// Fallback: better-sqlite3 (synchrone, mutex JS)
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mutex JS simple pour accès concurrent
class Mutex {
  constructor() {
    this._locked = false;
    this._waiting = [];
  }
  async lock() {
    while (this._locked) {
      await new Promise((resolve) => this._waiting.push(resolve));
    }
    this._locked = true;
  }
  unlock() {
    this._locked = false;
    if (this._waiting.length > 0) {
      const next = this._waiting.shift();
      next();
    }
  }
}

class DatabasePool {
  #db = null;
  #mutex = new Mutex();
  #isConnected = false;
  #dbPath = null;

  constructor(options = {}) {
    this.#dbPath =
      options.dbPath ||
      path.join(__dirname, "../../data/suggestions.sqlite");
  }

  async connect() {
    if (this.#isConnected && this.#db) return;

    try {
      // Créer le répertoire si nécessaire
      const dbDir = path.dirname(this.#dbPath);
      await import("fs").then((fs) => {
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
      });

      this.#db = new Database(this.#dbPath, {
        verbose: process.env.NODE_ENV === "dev" ? logger.info : null,
        pragma: {
          journal_mode: "WAL",
          synchronous: "NORMAL",
          cache_size: -64000,
          temp_store: "MEMORY",
          mmap_size: 268435456,
          page_size: 4096,
        },
      });

      this.#isConnected = true;

      // Mettre à jour AppState
      appState.setDatabaseConnected(true);
      appState.setDatabaseHealthy(true);

      logger.success("Base de données SQLite connectée (mode pool-ready)");

      // Initialiser les tables si nécessaire
      await this.initializeTables();
    } catch (error) {
      appState.setDatabaseConnected(false);
      appState.setDatabaseHealthy(false);
      throw error;
    }
  }

  async initializeTables() {
    try {
      // Table des suggestions
      this.#db.exec(`
        CREATE TABLE IF NOT EXISTS suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT NOT NULL,
          username TEXT NOT NULL,
          titre TEXT NOT NULL,
          artiste TEXT NOT NULL,
          lien TEXT,
          genre TEXT,
          status TEXT DEFAULT 'pending',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Table du statut DJ
      this.#db.exec(`
        CREATE TABLE IF NOT EXISTS dj_status (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT UNIQUE NOT NULL,
          username TEXT NOT NULL,
          is_dj BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      logger.info("Tables de base de données initialisées");
    } catch (error) {
      logger.error("Erreur lors de l'initialisation des tables:", error);
      throw error;
    }
  }

  async acquire() {
    await this.#mutex.lock();
    return this.#db;
  }

  async release() {
    this.#mutex.unlock();
  }

  async query(sql, params = []) {
    return await retryDatabase(
      async () => {
        await this.connect();
        await this.acquire();

        try {
          let result;
          if (/^select/i.test(sql.trim())) {
            result = this.#db.prepare(sql).all(params);
          } else {
            result = this.#db.prepare(sql).run(params);
          }

          // Mettre à jour les métriques
          appState.incrementQueriesExecuted();

          return result;
        } catch (error) {
          appState.incrementQueriesFailed();
          appState.setDatabaseHealthy(false);
          throw error;
        } finally {
          await this.release();
        }
      },
      {
        onRetry: (error, attempt) => {
          logger.warn(`Tentative de requête DB ${attempt}: ${error.message}`);
        },
      }
    );
  }

  async transaction(fn) {
    return await retryDatabase(async () => {
      await this.connect();
      await this.acquire();

      try {
        const tx = this.#db.transaction(fn);
        const result = tx();

        // Mettre à jour les métriques
        appState.incrementQueriesExecuted();

        return result;
      } catch (error) {
        appState.incrementQueriesFailed();
        appState.setDatabaseHealthy(false);
        throw error;
      } finally {
        await this.release();
      }
    });
  }

  async close() {
    if (this.#db && this.#isConnected) {
      this.#db.close();
      this.#db = null;
      this.#isConnected = false;

      // Mettre à jour AppState
      appState.setDatabaseConnected(false);
      appState.setDatabaseHealthy(false);

      logger.success("Connexion à la base de données fermée");
    }
  }

  isHealthy() {
    try {
      if (!this.#db || !this.#isConnected) return false;
      this.#db.prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  getStats() {
    if (!this.#db || !this.#isConnected) return null;
    try {
      const suggestions = this.#db
        .prepare("SELECT COUNT(*) as count FROM suggestions")
        .get();
      const dj = this.#db
        .prepare("SELECT COUNT(*) as count FROM dj_status")
        .get();
      return {
        suggestions: suggestions.count,
        djStatus: dj.count,
        connected: this.#isConnected,
        path: this.#dbPath,
      };
    } catch {
      return null;
    }
  }

  // Méthodes utilitaires pour les opérations courantes
  async addSuggestion(
    userId,
    username,
    titre,
    artiste,
    lien = null,
    genre = null
  ) {
    return await this.query(
      "INSERT INTO suggestions (userId, username, titre, artiste, lien, genre) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, username, titre, artiste, lien, genre]
    );
  }

  async getSuggestions(status = null) {
    const sql = status
      ? "SELECT * FROM suggestions WHERE status = ? ORDER BY createdAt DESC"
      : "SELECT * FROM suggestions ORDER BY createdAt DESC";
    const params = status ? [status] : [];
    return await this.query(sql, params);
  }

  async updateSuggestionStatus(id, status) {
    return await this.query(
      "UPDATE suggestions SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
      [status, id]
    );
  }

  async setDjStatus(userId, username, isDj) {
    return await this.query(
      `INSERT OR REPLACE INTO dj_status (user_id, username, is_dj, updated_at) 
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [userId, username, isDj ? 1 : 0]
    );
  }

  async getDjStatus(userId) {
    const result = await this.query(
      "SELECT is_dj FROM dj_status WHERE user_id = ?",
      [userId]
    );
    return result.length > 0 ? result[0].is_dj === 1 : false;
  }

  async getAllDjStatus() {
    return await this.query("SELECT * FROM dj_status ORDER BY updated_at DESC");
  }
}

// Singleton instance
const db = new DatabasePool();

export async function getDatabase() {
  await db.connect();
  return db;
}
export async function disconnectDatabase() {
  return db.close();
}
export function isDatabaseHealthy() {
  return db.isHealthy();
}
export function getDatabaseStats() {
  return db.getStats();
}
export { db };

