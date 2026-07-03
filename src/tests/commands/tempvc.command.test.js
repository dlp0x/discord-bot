import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from 'discord.js';
import { createInteraction, createTempVoiceChannel } from '../helpers/discordFactory.js';

vi.mock('#shared/database/tempVcStore.js', () => ({
  createTempVcChannelRecord: vi.fn(),
  deleteTempVcChannelRecord: vi.fn(),
  getTempVcChannelRecord: vi.fn(),
  getTempVcSettings: vi.fn(),
  updateTempVcFlags: vi.fn(),
  updateTempVcOwner: vi.fn(),
  upsertTempVcSettings: vi.fn()
}));

vi.mock('#bot/services/radioPlaybackService.js', () => ({
  isRadioActiveForTempChannel: vi.fn(() => false),
  startRadioInVoiceChannel: vi.fn(),
  stopRadioForTempChannel: vi.fn()
}));

const store = await import('#shared/database/tempVcStore.js');
const playback = await import('#bot/services/radioPlaybackService.js');
const tempVcService = await import('#bot/services/tempVcService.js');

describe('TempVC command services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('valide que le join channel est vocal pendant le setup', async () => {
    const interaction = createInteraction({
      optionValues: {
        join_channel: { id: 'text', name: 'text', type: 0 },
        category: null,
        auto_play_radio: false
      }
    });

    const result = await tempVcService.setupTempVc(interaction);

    expect(result.success).toBe(false);
    expect(result.message).toContain('salon vocal');
    expect(store.upsertTempVcSettings).not.toHaveBeenCalled();
  });

  it('enregistre la configuration TempVC valide', async () => {
    const interaction = createInteraction({
      guildId: '123456789012345678',
      optionValues: {
        join_channel: { id: 'join', name: 'Join', type: ChannelType.GuildVoice },
        category: { id: 'cat', name: 'Temp', type: ChannelType.GuildCategory },
        auto_play_radio: true
      }
    });

    const result = await tempVcService.setupTempVc(interaction);

    expect(result.success).toBe(true);
    expect(store.upsertTempVcSettings).toHaveBeenCalledWith({
      guildId: '123456789012345678',
      joinChannelId: 'join',
      categoryId: 'cat',
      autoPlayRadio: true
    });
  });

  it('refuse le panel quand le membre n est pas dans un salon temporaire', async () => {
    const result = await tempVcService.sendTempVcPanel(createInteraction());

    expect(result.success).toBe(false);
    expect(result.message).toContain('salon temporaire');
  });

  it('verrouille un salon temporaire pour son proprietaire', async () => {
    const channel = createTempVoiceChannel();
    store.getTempVcChannelRecord.mockResolvedValue({
      channelId: channel.id,
      ownerId: '111111111111111111',
      autoPlayRadio: false
    });
    const interaction = createInteraction({
      customId: 'tempvc_lock',
      type: 'button',
      voiceChannel: channel
    });

    await tempVcService.handleTempVcButton(interaction);

    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith('everyone', {
      Connect: false,
      ViewChannel: true
    });
    expect(store.updateTempVcFlags).toHaveBeenCalledWith(channel.id, { isLocked: true });
    expect(interaction.reply.mock.calls[0][0].content).toContain('verrouill');
  });

  it('refuse la gestion par un membre qui n est ni proprietaire ni admin', async () => {
    const channel = createTempVoiceChannel();
    store.getTempVcChannelRecord.mockResolvedValue({
      channelId: channel.id,
      ownerId: '999999999999999999',
      autoPlayRadio: false
    });
    const interaction = createInteraction({
      customId: 'tempvc_lock',
      type: 'button',
      voiceChannel: channel
    });

    await tempVcService.handleTempVcButton(interaction);

    expect(store.updateTempVcFlags).not.toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('propri');
  });

  it('bascule l auto-play radio et demarre le stream', async () => {
    const channel = createTempVoiceChannel();
    store.getTempVcChannelRecord.mockResolvedValue({
      channelId: channel.id,
      ownerId: '111111111111111111',
      autoPlayRadio: false
    });
    const interaction = createInteraction({
      customId: 'tempvc_toggle_autoplay',
      type: 'button',
      voiceChannel: channel
    });

    await tempVcService.handleTempVcButton(interaction);

    expect(store.updateTempVcFlags).toHaveBeenCalledWith(channel.id, { autoPlayRadio: true });
    expect(playback.startRadioInVoiceChannel).toHaveBeenCalledWith(channel);
  });

  it('valide la limite utilisateur d un modal', async () => {
    const channel = createTempVoiceChannel();
    const guild = { channels: { cache: new Map([[channel.id, channel]]) } };
    store.getTempVcChannelRecord.mockResolvedValue({
      channelId: channel.id,
      ownerId: '111111111111111111'
    });
    const interaction = createInteraction({
      customId: `tempvc_modal_limit_${channel.id}`,
      fieldValues: { limit: '120' },
      guild,
      type: 'modal'
    });

    await tempVcService.handleTempVcModal(interaction);

    expect(channel.setUserLimit).not.toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('invalide');
  });
});
