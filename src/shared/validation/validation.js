// ========================================
// shared/validation/validator.js
// ========================================

class Validator {
  constructor () {
    this.maxLengths = {
      username: 32,
      command: 100,
      message: 2000,
      url: 2048,
      filename: 255
    };

    this.patterns = {
      discordId: /^\d{17,19}$/,
      url: /^https?:\/\/.+/,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      filename: /^[a-zA-Z0-9._-]+$/,
      command: /^[a-zA-Z0-9_-]+$/
    };

    this.forbidden = [
      /javascript:/gi,
      /on\w+\s*=/gi,
      /eval\s*\(/gi,
      /document\./gi,
      /window\./gi,
      /data:text\/html/gi
    ];
  }

  // =========================
  // CORE SANITIZATION
  // =========================
  sanitize (input, options = {}) {
    if (typeof input !== 'string') return input;

    let out = input.trim();

    for (const p of this.forbidden) {
      out = out.replace(p, '');
    }

    if (options.maxLength) {
      out = out.slice(0, options.maxLength);
    }

    return out;
  }

  // =========================
  // DISCORD ID
  // =========================
  validateDiscordId (id) {
    if (!this.patterns.discordId.test(id)) {
      throw new Error('Invalid Discord ID');
    }
    return id;
  }

  // =========================
  // USERNAME
  // =========================
  validateUsername (name) {
    const v = this.sanitize(name, {
      maxLength: this.maxLengths.username
    });

    if (v.length < 2) {
      throw new Error('Username too short');
    }

    return v;
  }

  // =========================
  // URL
  // =========================
  validateUrl (url) {
    const v = this.sanitize(url, {
      maxLength: this.maxLengths.url
    });

    if (!this.patterns.url.test(v)) {
      throw new Error('Invalid URL');
    }

    return v;
  }

  // =========================
  // COMMAND
  // =========================
  validateCommand (cmd) {
    const v = this.sanitize(cmd, {
      maxLength: this.maxLengths.command
    });

    if (!this.patterns.command.test(v)) {
      throw new Error('Invalid command');
    }

    return v;
  }

  // =========================
  // GENERIC OBJECT SANITIZE
  // =========================
  sanitizeObject (obj) {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(v => this.sanitizeObject(v));
    }

    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] =
        typeof v === 'string'
          ? this.sanitize(v)
          : this.sanitizeObject(v);
    }

    return out;
  }
}

export default new Validator();