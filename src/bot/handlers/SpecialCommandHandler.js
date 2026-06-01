// ========================================
// bot/events/handlers/SpecialCommandHandler.js - Gestion des commandes spéciales
// ========================================

import logger from '../../shared/logging/logger.js';
import stageMonitor from '../../core/services/StageMonitor.js';
import stageSpeakerManager from '../../core/services/StageSpeakerManager.js';

/**
 * Gérer les commandes spéciales qui nécessitent deferReply
 */
export async function handleSpecialCommands (interaction, result, commandName) {
  if (result.message === 'PLAY_COMMAND') {
    logger.info(`Traitement de la commande ${commandName}`);
    await handlePlayCommand(interaction);
    return;
  }

  if (result.message === 'SCHEDULE_COMMAND') {
    logger.info('Traitement de la commande SCHEDULE_COMMAND');
    await handleScheduleCommand(interaction, result);
  }
}

/**
 * Traiter la commande play
 */
async function handlePlayCommand (interaction) {
  try {
    logger.info('🚀 Début de handlePlayCommand');

    const { voice } = interaction.member;
    const channel = voice && voice.channel;

    logger.info('📡 Vérification du canal vocal:', {
      hasVoice: !!voice,
      hasChannel: !!channel,
      channelType: channel?.type
    });

    logger.info('📦 Import des modules audio...');
    const {
      joinVoiceChannel,
      createAudioPlayer,
      createAudioResource,
      AudioPlayerStatus,
      NoSubscriberBehavior,
      StreamType,
      entersState, // À AJOUTER : pour attendre l'état de la connexion
      VoiceConnectionStatus // À AJOUTER
    } = await import('@discordjs/voice');
    logger.success('Modules audio importés avec succès');

    const config = (await import('../config.js')).default;
    const { STREAM_URL } = config;
    logger.info('🔗 URL du stream récupérée:', STREAM_URL ? 'OK' : 'MANQUANTE');

    if (!STREAM_URL) {
      logger.error('❌ STREAM_URL non configurée dans les variables d\'environnement');
      await interaction.editReply('❌ URL du stream non configurée. Contactez un administrateur.');
      return;
    }

    logger.info('🔌 Connexion au canal vocal...');
    let connection;
    try {
      connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false
      });
      logger.success('Connexion établie');

      // 🔥 ÉTAPE 1 : Attendre que Discord valide la connexion réseau du bot
      logger.info('⏳ Attente de l\'état Ready de la connexion...');
      await entersState(connection, VoiceConnectionStatus.Ready, 5000);
      logger.success('Connexion vocale Ready');
    } catch (connectionError) {
      logger.error('❌ Erreur de connexion vocale:', {
        message: connectionError.message,
        code: connectionError.code,
        channelId: channel.id,
        guildId: channel.guild.id
      });
      await interaction.editReply(`❌ Erreur de connexion au canal vocal: ${connectionError.message}`);
      return;
    }

    // 🔥 ÉTAPE 2 : S'auto-promouvoir Speaker AVANT de générer le moindre son
    logger.info('🎤 Tentative de promotion en Speaker avant lecture...');
    let promotionResult = { success: false, message: 'Non exécuté' };
    try {
      promotionResult = await stageSpeakerManager.promoteToSpeaker(connection, channel);
      if (promotionResult.success) {
        logger.success('🎤 Auto-promotion en speaker réussie (Avant-lecture)');
      } else {
        logger.warn('🎤 Auto-promotion échouée avant lecture:', promotionResult.message);
      }
    } catch (promotionError) {
      logger.error('🎤 Erreur critique lors de la promotion initiale:', promotionError);
    }

    logger.info('🎵 Création du player audio...');
    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
      }
    });
    logger.success('Player créé');

    const AUDIO_INPUT_TYPE = StreamType?.Arbitrary ?? undefined;

    logger.info('🎼 Création de la ressource audio...');
    let resource;
    try {
      resource = createAudioResource(STREAM_URL, {
        inputType: AUDIO_INPUT_TYPE,
        inlineVolume: true
      });
      logger.success('Ressource audio créée');
    } catch (resourceError) {
      logger.error('❌ Erreur de création de ressource audio:', {
        message: resourceError.message,
        streamUrl: STREAM_URL
      });
      await interaction.editReply(`❌ Erreur de création de ressource audio: ${resourceError.message}`);
      return;
    }

    // 🔥 ÉTAPE 3 : Enregistrer les écouteurs d'événements AVANT de lancer la lecture
    player.once(AudioPlayerStatus.Playing, async () => {
      logger.info('🎵 Événement Playing détecté (Le son sort !)');
      
      if (promotionResult.success) {
        await interaction.editReply('▶️ Stream lancé dans le stage channel. 🎤 Bot promu en speaker automatiquement.');
      } else {
        const missingPerms = stageSpeakerManager.formatMissingPermissions(
          promotionResult.missingPermissions || []
        );
        const errorMessage = missingPerms.length > 0 ? `Permissions manquantes: ${missingPerms.join(', ')}` : '';
        await interaction.editReply(
          `▶️ Stream démarré.\n⚠️ Le bot est peut-être muet (Public) : ${promotionResult.message}\n${errorMessage}`
        );
      }
      logger.success('Message de statut envoyé à l\'utilisateur');
    });

    player.on('error', async (error) => {
      logger.error('❌ Erreur du player:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
        streamUrl: STREAM_URL
      });
      await interaction.editReply(`❌ Erreur pendant la lecture du stream: ${error.message}`);
    });

    // 🔥 ÉTAPE 4 : Envoyer la sauce audio
    logger.info('▶️ Lancement de la lecture...');
    player.play(resource);
    connection.subscribe(player);
    logger.success('Lecture lancée');

    interaction.client.audio = { connection, player };
    logger.info('💾 Audio sauvegardé dans client.audio');

    stageMonitor.registerStage(channel.guild.id, channel.id, channel.guild);
    logger.info('🎭 Stage enregistré pour surveillance automatique');

    logger.success('handlePlayCommand terminé avec succès');
  } catch (error) {
    logger.error('❌ Erreur lors du traitement de la commande play:', error);
    await interaction.editReply({
      content: '❌ Erreur lors de l\'exécution de la commande play.'
    });
  }
}


/**
 * Traiter la commande schedule
 */
async function handleScheduleCommand (interaction, _result) {
  try {
    const scheduleCommand = await import('../../commands/schedule.js');
    const result = await scheduleCommand.default.execute(interaction);

    if (result && result.success) {
      await interaction.editReply({
        content: result.message,
        flags: result.ephemeral !== false ? 64 : 0
      });
    } else {
      await interaction.editReply({
        content: '❌ Erreur lors de l\'exécution de la commande schedule.',
        flags: 64
      });
    }
  } catch (error) {
    logger.error('Erreur lors du traitement de la commande schedule:', error);
    await interaction.editReply({
      content: '❌ Erreur lors de l\'exécution de la commande schedule.',
      flags: 64
    });
  }
}
