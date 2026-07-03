import { describe, expect, it } from 'vitest';
import { createInteraction } from '../helpers/discordFactory.js';
import { validateInteractionInput } from '#bot/handlers/ValidationHandler.js';

describe('ValidationHandler', () => {
  it('refuse un ID utilisateur Discord invalide', async () => {
    const interaction = createInteraction({
      user: { id: 'bad-id', tag: 'bad#0001', username: 'bad' }
    });

    await expect(validateInteractionInput(interaction)).resolves.toEqual({
      valid: false,
      error: 'ID utilisateur invalide'
    });
  });

  it('sanitise les champs titre et artiste des suggestions', async () => {
    const interaction = createInteraction({
      commandName: 'suggestion',
      optionValues: {
        titre: '  javascript:Song  ',
        artiste: '  Artist onclick=bad  '
      }
    });

    const result = await validateInteractionInput(interaction);

    expect(result.valid).toBe(true);
    expect(interaction.options._hoistedOptions).toContainEqual({
      name: 'titre',
      value: 'Song'
    });
    expect(interaction.options._hoistedOptions.find((opt) => opt.name === 'artiste').value)
      .toContain('Artist');
  });

  it('refuse un bouton avec un customId dangereux', async () => {
    const interaction = createInteraction({
      customId: 'bad/id',
      type: 'button'
    });

    const result = await validateInteractionInput(interaction);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('bouton');
  });

  it('refuse une valeur de select menu invalide', async () => {
    const interaction = createInteraction({
      customId: 'playlist_select',
      type: 'select',
      values: ['valid_value', 'bad/value']
    });

    const result = await validateInteractionInput(interaction);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Valeur');
  });
});
