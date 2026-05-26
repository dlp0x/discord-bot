import { db } from '#shared/database/database.js';
import logger from '#shared/logging/logger.js';

let isInitialized = false;

async function ensureTables () {
  if (isInitialized) return;

  await db.connect();
  await db.query(`
    CREATE TABLE IF NOT EXISTS tempvc_settings (
      guild_id TEXT PRIMARY KEY,
      join_channel_id TEXT NOT NULL,
      category_id TEXT,
      auto_play_radio INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS tempvc_channels (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      auto_play_radio INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  isInitialized = true;
  logger.debug('Tables TempVC initialisées');
}

export async function upsertTempVcSettings (payload) {
  await ensureTables();
  const { guildId, joinChannelId, categoryId = null, autoPlayRadio = false } = payload;

  await db.query(
    `INSERT INTO tempvc_settings (guild_id, join_channel_id, category_id, auto_play_radio, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(guild_id)
     DO UPDATE SET
       join_channel_id = excluded.join_channel_id,
       category_id = excluded.category_id,
       auto_play_radio = excluded.auto_play_radio,
       updated_at = CURRENT_TIMESTAMP`,
    [guildId, joinChannelId, categoryId, autoPlayRadio ? 1 : 0]
  );
}

export async function getTempVcSettings (guildId) {
  await ensureTables();
  const rows = await db.query('SELECT * FROM tempvc_settings WHERE guild_id = ?', [guildId]);
  if (!rows.length) return null;

  const [row] = rows;
  return {
    guildId: row.guild_id,
    joinChannelId: row.join_channel_id,
    categoryId: row.category_id,
    autoPlayRadio: row.auto_play_radio === 1
  };
}

export async function createTempVcChannelRecord (payload) {
  await ensureTables();
  const { channelId, guildId, ownerId, autoPlayRadio = false } = payload;

  await db.query(
    `INSERT INTO tempvc_channels (channel_id, guild_id, owner_id, auto_play_radio)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(channel_id)
     DO UPDATE SET
       owner_id = excluded.owner_id,
       auto_play_radio = excluded.auto_play_radio,
       updated_at = CURRENT_TIMESTAMP`,
    [channelId, guildId, ownerId, autoPlayRadio ? 1 : 0]
  );
}

export async function getTempVcChannelRecord (channelId) {
  await ensureTables();
  const rows = await db.query('SELECT * FROM tempvc_channels WHERE channel_id = ?', [channelId]);
  if (!rows.length) return null;

  const [row] = rows;
  return {
    channelId: row.channel_id,
    guildId: row.guild_id,
    ownerId: row.owner_id,
    autoPlayRadio: row.auto_play_radio === 1,
    isLocked: row.is_locked === 1,
    isHidden: row.is_hidden === 1
  };
}

export async function deleteTempVcChannelRecord (channelId) {
  await ensureTables();
  await db.query('DELETE FROM tempvc_channels WHERE channel_id = ?', [channelId]);
}

export async function updateTempVcOwner (channelId, ownerId) {
  await ensureTables();
  await db.query(
    'UPDATE tempvc_channels SET owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE channel_id = ?',
    [ownerId, channelId]
  );
}

export async function updateTempVcFlags (channelId, flags) {
  await ensureTables();
  const updates = [];
  const params = [];

  if (typeof flags.isLocked === 'boolean') {
    updates.push('is_locked = ?');
    params.push(flags.isLocked ? 1 : 0);
  }

  if (typeof flags.isHidden === 'boolean') {
    updates.push('is_hidden = ?');
    params.push(flags.isHidden ? 1 : 0);
  }

  if (typeof flags.autoPlayRadio === 'boolean') {
    updates.push('auto_play_radio = ?');
    params.push(flags.autoPlayRadio ? 1 : 0);
  }

  if (updates.length === 0) return;

  params.push(channelId);
  await db.query(
    `UPDATE tempvc_channels SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE channel_id = ?`,
    params
  );
}
