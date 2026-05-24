class Validator {
  constructor () {
    this.maxLengths = {
      username: 32,
      command: 100,
      message: 2000,
      url: 2048,
      filename: 255,
      suggestion: 500
    };

    this.patterns = {
      discordId: /^\d{17,19}$/,
      url: /^https?:\/\/.+/,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      filename: /^[a-zA-Z0-9._-]+$/,
      command: /^[a-zA-Z0-9_-]+$/,
      dangerousHtml: /on\w+\s*=|<script|javascript:/gi
    };

    this.forbidden = [
      /javascript:/gi,
      /on\w+\s*=/gi,
      /alert\s*\(/gi,
      /eval\s*\(/gi,
      /document\./gi,
      /window\./gi,
      /data:text\/html/gi
    ];

    this.forbiddenSuggestionWords = ['spam'];
  }

  sanitize (input, options = {}) {
    if (typeof input !== 'string') return input;

    let out = input.trim();

    for (const p of this.forbidden) {
      out = out.replace(p, '');
    }

    if (options.escapeHtml) {
      out = out
        .replace(/</g, '')
        .replace(/>/g, '');
    }

    if (options.maxLength) {
      out = out.slice(0, options.maxLength);
    }

    return out;
  }

  sanitizeString (input, options = {}) {
    return this.sanitize(input, options);
  }

  containsDangerousHtml (input) {
    if (typeof input !== 'string') return false;
    return this.patterns.dangerousHtml.test(input);
  }

  validateSuggestion (text) {
    const v = this.sanitize(text, { maxLength: this.maxLengths.suggestion, escapeHtml: true });

    if (!v || v.length < 3) {
      throw new Error('La suggestion doit contenir au moins 3 caractères');
    }

    const lower = v.toLowerCase();
    if (this.forbiddenSuggestionWords.some((w) => lower.includes(w))) {
      throw new Error('La suggestion contient un contenu interdit');
    }

    return v;
  }

  validateDiscordId (id) {
    if (!this.patterns.discordId.test(id)) {
      throw new Error('ID Discord invalide');
    }
    return id;
  }

  validateUsername (name) {
    const v = this.sanitize(name, {
      maxLength: this.maxLengths.username
    });

    if (v.length < 2) {
      throw new Error('Username too short');
    }

    return v;
  }

  validateUrl (url) {
    const v = this.sanitize(url, {
      maxLength: this.maxLengths.url
    });

    if (!this.patterns.url.test(v)) {
      throw new Error('URL invalide');
    }

    return v;
  }

  validateCommand (cmd) {
    const v = this.sanitize(cmd, {
      maxLength: this.maxLengths.command
    });

    if (!this.patterns.command.test(v)) {
      throw new Error('Invalid command');
    }

    return v;
  }

  validateFilename (name) {
    const v = this.sanitize(name, { maxLength: this.maxLengths.filename });
    if (!this.patterns.filename.test(v)) {
      throw new Error('Nom de fichier invalide');
    }

    const blockedExt = ['.exe', '.bat', '.vbs', '.com', '.js'];
    const lower = v.toLowerCase();
    if (blockedExt.some((ext) => lower.endsWith(ext))) {
      throw new Error('Extension de fichier interdite');
    }

    return v;
  }

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
