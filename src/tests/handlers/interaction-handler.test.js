import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, lastReplyContent } from '../helpers/discordFactory.js';

vi.mock('#bot/services/tempVcService.js', () => ({
  handleTempVcButton: vi.fn(),
  handleTempVcModal: vi.fn(),
  isTempVcButton: vi.fn(() => false)
}));

const { handleInteractionByType } = await import('#bot/handlers/InteractionHandler.js');

describe('InteractionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('execute une slash command connue et normalise un succes silencieux', async () => {
    const execute = vi.fn();
    const interaction = createInteraction({
      commandName: 'known',
      client: {
        commands: new Map([['known', { execute }]])
      }
    });

    const result = await handleInteractionByType(interaction, interaction.client);

    expect(execute).toHaveBeenCalledWith(interaction, expect.objectContaining({
      interaction,
      user: interaction.user
    }));
    expect(result.success).toBe(true);
    expect(result.message).toContain('known');
  });

  it('retourne une erreur utilisateur pour une commande inconnue', async () => {
    const interaction = createInteraction({
      commandName: 'missing',
      client: { commands: new Map() }
    });

    const result = await handleInteractionByType(interaction, interaction.client);

    expect(result.success).toBe(false);
    expect(result.message).toContain('missing');
  });

  it('gere les boutons de confirmation sans handler externe', async () => {
    const interaction = createInteraction({
      customId: 'confirm_delete',
      type: 'button'
    });

    const result = await handleInteractionByType(interaction, {});

    expect(result.success).toBe(true);
    expect(interaction.update).toHaveBeenCalledWith({
      content: expect.stringContaining('confirm'),
      components: []
    });
  });

  it('repond aux select menus avec les valeurs choisies', async () => {
    const interaction = createInteraction({
      customId: 'playlist_select',
      type: 'select',
      values: ['rock', 'jazz']
    });

    const result = await handleInteractionByType(interaction, {});

    expect(result.success).toBe(true);
    expect(lastReplyContent(interaction)).toContain('rock, jazz');
  });

  it('retourne une reponse de repli si la commande lance une exception', async () => {
    const interaction = createInteraction({
      commandName: 'boom',
      client: {
        commands: new Map([['boom', { execute: vi.fn(async () => {
          throw new Error('boom');
        }) }]])
      }
    });

    const result = await handleInteractionByType(interaction, interaction.client);

    expect(result.success).toBe(false);
    expect(result.message).toContain('boom');
  });
});
