import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, lastReplyContent } from '../helpers/discordFactory.js';

vi.mock('axios');
vi.mock('#core/services/ScheduleService.js', () => ({
  default: {
    getFormattedSchedule: vi.fn(async (language) => ({
      title: language === 'fr' ? 'Horaire FR' : 'Schedule EN',
      content: 'Emission A'
    }))
  }
}));

const { handleButtonInteraction } = await import('#bot/handlers/ButtonHandler.js');

describe('ButtonHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('met a jour le message avec l horaire demande', async () => {
    const interaction = createInteraction({
      customId: 'schedule_fr',
      type: 'button'
    });

    const result = await handleButtonInteraction(interaction);

    expect(result.success).toBe(true);
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({
      components: []
    }));
  });

  it('affiche les stats completes Icecast quand l API repond', async () => {
    axios.get.mockResolvedValue({
      data: { icestats: { source: { listeners: 4 } } }
    });
    const interaction = createInteraction({
      customId: 'show_full_stats',
      type: 'button'
    });

    await handleButtonInteraction(interaction);

    expect(interaction.update.mock.calls[0][0].content).toContain('listeners');
  });

  it('affiche une erreur de repli si les stats completes echouent', async () => {
    axios.get.mockRejectedValue(new Error('offline'));
    const interaction = createInteraction({
      customId: 'show_full_stats',
      type: 'button'
    });

    await handleButtonInteraction(interaction);

    expect(interaction.update.mock.calls[0][0].content).toContain('Impossible');
  });

  it('repond aux boutons inconnus sans lancer d exception', async () => {
    const interaction = createInteraction({
      customId: 'unknown_button',
      type: 'button'
    });

    const result = await handleButtonInteraction(interaction);

    expect(result.success).toBe(true);
    expect(lastReplyContent(interaction)).toContain('non reconnu');
  });
});
