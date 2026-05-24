import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVoiceConnectionMock = vi.fn();
const promoteToSpeakerMock = vi.fn();
const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  success: vi.fn()
};

vi.mock('@discordjs/voice', () => ({
  getVoiceConnection: getVoiceConnectionMock
}));

vi.mock('../bot/logger.js', () => ({
  default: loggerMock
}));

vi.mock('../core/services/StageSpeakerManager.js', () => ({
  default: {
    promoteToSpeaker: promoteToSpeakerMock
  }
}));

describe('StageMonitor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('disconnecte proprement quand il ne reste que des bots dans un stage surveille', async () => {
    const connection = {
      joinConfig: {
        channelId: 'stage-1'
      },
      state: {
        subscription: {
          player: {
            stop: vi.fn()
          }
        }
      },
      destroy: vi.fn()
    };

    const humanMembers = { size: 0 };
    const botMembers = { size: 1 };

    const voiceChannel = {
      id: 'stage-1',
      name: 'Main Stage',
      type: 13,
      members: {
        filter: vi.fn(memberFilter =>
          memberFilter({ user: { bot: false } }) ? humanMembers : botMembers
        )
      }
    };

    const guild = {
      channels: {
        cache: new Map([['stage-1', voiceChannel]])
      }
    };

    getVoiceConnectionMock.mockReturnValue(connection);
    promoteToSpeakerMock.mockResolvedValue({ success: true, message: 'ok' });

    const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

    stageMonitor.registerStage('guild-1', 'stage-1', guild);
    const checkPromise = stageMonitor.checkStage('guild-1', 'stage-1');
    await vi.advanceTimersByTimeAsync(3500);
    await checkPromise;

    expect(connection.state.subscription.player.stop).toHaveBeenCalledWith(true);
    expect(connection.destroy).toHaveBeenCalledTimes(1);
    expect(stageMonitor.connectedStages.has('guild-1')).toBe(false);

    vi.useRealTimers();
  });

  it('absorbe les erreurs de promotion differee au lieu de laisser une rejection non geree', async () => {
    const connection = {
      joinConfig: {
        channelId: 'stage-1'
      }
    };

    const channel = {
      id: 'stage-1',
      name: 'Main Stage',
      type: 13
    };

    const guild = {
      channels: {
        cache: new Map([['stage-1', channel]])
      }
    };

    getVoiceConnectionMock.mockReturnValue(connection);
    promoteToSpeakerMock.mockRejectedValue(new Error('promotion failed'));

    const { default: stageMonitor } = await import('../core/services/StageMonitor.js');

    stageMonitor.registerStage('guild-1', 'stage-1', guild);
    await vi.advanceTimersByTimeAsync(3000);

    expect(promoteToSpeakerMock).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
