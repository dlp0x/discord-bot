import { describe, expect, it } from 'vitest';
import validateURL from '#shared/validation/validateURL.js';
import validator from '#shared/validation/validation.js';
import { safeStringify } from '#bot/utils/SafeStringify.js';

describe('business utilities', () => {
  it('accepte uniquement les URLs de plateformes supportees', () => {
    expect(validateURL('https://www.youtube.com/watch?v=abc123')).toBe(true);
    expect(validateURL('https://youtu.be/abc123')).toBe(true);
    expect(validateURL('https://open.spotify.com/track/abc123')).toBe(true);
    expect(validateURL('https://twitch.tv/soundshine')).toBe(true);
    expect(validateURL('https://example.com/song')).toBe(false);
    expect(validateURL('not-a-url')).toBe(false);
  });

  it('sanitise les chaines dangereuses sans toucher les autres champs', () => {
    expect(validator.sanitize(' javascript:Hello onclick=bad ')).toBe('Hello bad');
    expect(validator.sanitizeObject({
      title: ' eval(test) Song ',
      nested: { count: 2 }
    })).toEqual({
      title: 'test) Song',
      nested: { count: 2 }
    });
  });

  it('valide les IDs Discord selon le format attendu', () => {
    expect(validator.validateDiscordId('123456789012345678')).toBe('123456789012345678');
    expect(() => validator.validateDiscordId('123')).toThrow('Invalid Discord ID');
  });

  it('serialise BigInt et references circulaires de maniere stable', () => {
    const value = { id: 10n };
    value.self = value;

    const serialized = safeStringify(value);

    expect(serialized).toContain('"id":"10"');
    expect(serialized).toContain('[Circular Reference]');
  });
});
