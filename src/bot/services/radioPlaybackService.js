import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  getVoiceConnection,
  StreamType
} from '@discordjs/voice';
import config from '../config.js';
import logger from '../../shared/logging/logger.js';

// StreamType.Arbitrary indique à @discordjs/voice de ne pas tenter
// de détecter/transcoder le format — évite le TimeoutNegativeWarning.
// Si StreamType n'est pas disponible (version ancienne), on passe undefined
// et @discordjs/voice utilisera la détection automatique.
const AUDIO_INPUT_TYPE = StreamType?.Arbitrary ?? undefined;

const tempVcConnections = new Map();

export function isRadioActiveForTempChannel (channelId) {
  return tempVcConnections.has(channelId);
}

export async function startRadioInVoiceChannel (channel) {
  if (!config.STREAM_URL) {
    logger.warn('TempVC auto-play ignoré: STREAM_URL non configurée');
    return { success: false, reason: 'STREAM_URL manquante' };
  }

  try {
    const alreadyActive = tempVcConnections.get(channel.id);
    if (alreadyActive) {
      return { success: true, reason: 'ALREADY_ACTIVE' };
    }

    const existing = getVoiceConnection(channel.guild.id);
    if (existing) {
      try {
        existing.destroy();
      } catch {
        // Ignore clean-up errors
      }
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false
    });

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
      }
    });

    const resource = createAudioResource(config.STREAM_URL, {
      inputType: AUDIO_INPUT_TYPE,
      inlineVolume: true
    });
    player.play(resource);
    connection.subscribe(player);

    tempVcConnections.set(channel.id, { connection, player });
    return { success: true };
  } catch (error) {
    logger.error('Erreur auto-play TempVC:', error);
    return { success: false, reason: error.message };
  }
}

export function stopRadioForTempChannel (channelId) {
  const active = tempVcConnections.get(channelId);
  if (!active) return;

  try {
    active.player.stop();
    active.connection.destroy();
  } catch {
    // Ignore clean-up errors
  }

  tempVcConnections.delete(channelId);
}
