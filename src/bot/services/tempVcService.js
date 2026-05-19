import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import logger from '#shared/logging/logger.js';
import {
  createTempVcChannelRecord,
  deleteTempVcChannelRecord,
  getTempVcChannelRecord,
  getTempVcSettings,
  updateTempVcFlags,
  updateTempVcOwner,
  upsertTempVcSettings
} from '#shared/database/tempVcStore.js';
import {
  isRadioActiveForTempChannel,
  startRadioInVoiceChannel,
  stopRadioForTempChannel
} from './radioPlaybackService.js';

const renameCooldown = new Map();
const RENAME_COOLDOWN_MS = 3 * 60 * 1000;

function tempVcPanelRows () {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tempvc_rename')
        .setLabel('Rename')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('tempvc_limit')
        .setLabel('Set user limit')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('tempvc_lock')
        .setLabel('Lock')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('tempvc_unlock')
        .setLabel('Unlock')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tempvc_hide')
        .setLabel('Hide')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('tempvc_unhide')
        .setLabel('Unhide')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('tempvc_claim')
        .setLabel('Claim')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('tempvc_toggle_autoplay')
        .setLabel('Auto-play radio')
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function getMemberTempChannel (interaction) {
  return interaction.member?.voice?.channel ?? null;
}

async function assertManageRights (interaction, record) {
  if (!record) {
    return { ok: false, message: '❌ Ce salon n\'est pas un salon temporaire géré.' };
  }

  const isOwner = record.ownerId === interaction.user.id;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);

  if (!isOwner && !isAdmin) {
    return {
      ok: false,
      message: '❌ Seul le propriétaire (ou un admin) peut gérer ce salon.'
    };
  }

  return { ok: true };
}

export async function setupTempVc (interaction) {
  const joinChannel = interaction.options.getChannel('join_channel', true);
  const category = interaction.options.getChannel('category');
  const autoPlayRadio = interaction.options.getBoolean('auto_play_radio') ?? false;

  if (joinChannel.type !== ChannelType.GuildVoice) {
    return {
      success: false,
      message: '❌ Le salon Join-to-Create doit être un salon vocal classique.',
      ephemeral: true
    };
  }

  if (category && category.type !== ChannelType.GuildCategory) {
    return {
      success: false,
      message: '❌ La catégorie doit être un salon de type catégorie.',
      ephemeral: true
    };
  }

  await upsertTempVcSettings({
    guildId: interaction.guildId,
    joinChannelId: joinChannel.id,
    categoryId: category?.id,
    autoPlayRadio
  });

  return {
    success: true,
    message:
      `✅ Join-to-Create configuré sur **${joinChannel.name}**.`
      + `${category ? `\n📁 Catégorie: **${category.name}**` : ''}`
      + `\n📻 Auto-play radio global: **${autoPlayRadio ? 'activé' : 'désactivé'}**`,
    ephemeral: true
  };
}

export async function sendTempVcPanel (interaction) {
  const channel = getMemberTempChannel(interaction);
  if (!channel) {
    return {
      success: false,
      message: '❌ Tu dois être dans ton salon temporaire.',
      ephemeral: true
    };
  }

  const record = await getTempVcChannelRecord(channel.id);
  if (!record) {
    return {
      success: false,
      message: '❌ Ce salon n\'est pas un salon temporaire.',
      ephemeral: true
    };
  }

  return {
    success: true,
    message: '🎛️ Panel TempVC: choisis une action.',
    components: tempVcPanelRows(),
    ephemeral: true
  };
}

export async function handleJoinToCreate (oldState, newState) {
  if (!newState.guild || oldState.channelId === newState.channelId) return;

  const settings = await getTempVcSettings(newState.guild.id);
  if (!settings) return;

  // Création d'un salon temporaire
  if (newState.channelId === settings.joinChannelId) {
    const username = newState.member?.user?.username ?? 'Utilisateur';

    const createdChannel = await newState.guild.channels.create({
      name: `Salon de ${username}`,
      type: ChannelType.GuildVoice,
      parent: settings.categoryId ?? null,
      permissionOverwrites: [
        {
          id: newState.guild.roles.everyone.id,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel]
        },
        {
          id: newState.member.id,
          allow: [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ViewChannel
          ]
        }
      ]
    });

    await createTempVcChannelRecord({
      channelId: createdChannel.id,
      guildId: newState.guild.id,
      ownerId: newState.member.id,
      autoPlayRadio: settings.autoPlayRadio
    });

    await newState.setChannel(createdChannel);

    if (settings.autoPlayRadio) {
      // Laisser le temps à Discord de finaliser le move du membre avant l'auto-play
      setTimeout(() => {
        startRadioInVoiceChannel(createdChannel).catch((error) => {
          logger.error('Erreur auto-play après création TempVC:', error);
        });
      }, 800);
    }

    return;
  }

  // Auto-play de sécurité: si un membre rejoint un temp VC avec auto-play actif
  if (newState.channelId) {
    const joinedRecord = await getTempVcChannelRecord(newState.channelId);
    if (joinedRecord?.autoPlayRadio && !isRadioActiveForTempChannel(newState.channelId)) {
      const joinedChannel = newState.guild.channels.cache.get(newState.channelId);
      if (joinedChannel && joinedChannel.members.size > 0) {
        await startRadioInVoiceChannel(joinedChannel);
      }
    }
  }

  // Suppression auto des salons vides
  if (oldState.channelId) {
    const record = await getTempVcChannelRecord(oldState.channelId);
    if (!record) return;

    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (channel && channel.members.size === 0) {
      stopRadioForTempChannel(channel.id);
      await deleteTempVcChannelRecord(channel.id);
      await channel.delete('TempVC: salon vide supprimé automatiquement');
    }
  }
}

function getRenameCooldownLeft (userId) {
  const lastUse = renameCooldown.get(userId);
  if (!lastUse) return 0;
  const remaining = RENAME_COOLDOWN_MS - (Date.now() - lastUse);
  return remaining > 0 ? remaining : 0;
}

export async function handleTempVcButton (interaction) {
  const channel = getMemberTempChannel(interaction);
  if (!channel) {
    await interaction.reply({
      content: '❌ Tu dois être dans un salon temporaire.',
      ephemeral: true
    });
    return { success: true, message: 'BUTTON_HANDLED' };
  }

  const record = await getTempVcChannelRecord(channel.id);

  if (interaction.customId === 'tempvc_claim') {
    if (!record) {
      await interaction.reply({
        content: '❌ Ce salon n\'est pas géré par TempVC.',
        ephemeral: true
      });
      return { success: true, message: 'BUTTON_HANDLED' };
    }

    const ownerStillInside = channel.members.has(record.ownerId);
    if (ownerStillInside) {
      await interaction.reply({
        content: '❌ Le propriétaire est encore présent.',
        ephemeral: true
      });
      return { success: true, message: 'BUTTON_HANDLED' };
    }

    await updateTempVcOwner(channel.id, interaction.user.id);
    await channel.permissionOverwrites.edit(interaction.user.id, {
      ManageChannels: true,
      MoveMembers: true,
      MuteMembers: true,
      DeafenMembers: true,
      Connect: true,
      ViewChannel: true
    });

    await interaction.reply({
      content: '✅ Tu es maintenant le propriétaire de ce salon.',
      ephemeral: true
    });
    return { success: true, message: 'BUTTON_HANDLED' };
  }

  const rights = await assertManageRights(interaction, record);
  if (!rights.ok) {
    await interaction.reply({ content: rights.message, ephemeral: true });
    return { success: true, message: 'BUTTON_HANDLED' };
  }

  if (interaction.customId === 'tempvc_rename') {
    const cooldownLeft = getRenameCooldownLeft(interaction.user.id);
    if (cooldownLeft > 0) {
      const seconds = Math.ceil(cooldownLeft / 1000);
      await interaction.reply({
        content: `⏳ Rename disponible dans ${seconds}s.`,
        ephemeral: true
      });
      return { success: true, message: 'BUTTON_HANDLED' };
    }

    const modal = new ModalBuilder()
      .setCustomId(`tempvc_modal_rename_${channel.id}`)
      .setTitle('Renommer le salon');

    const input = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Nouveau nom')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(90);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return { success: true, message: 'BUTTON_HANDLED' };
  }

  if (interaction.customId === 'tempvc_limit') {
    const modal = new ModalBuilder()
      .setCustomId(`tempvc_modal_limit_${channel.id}`)
      .setTitle('Limite d\'utilisateurs');

    const input = new TextInputBuilder()
      .setCustomId('limit')
      .setLabel('Nombre 0-99 (0 = illimité)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(channel.userLimit ?? 0));

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return { success: true, message: 'BUTTON_HANDLED' };
  }

  if (interaction.customId === 'tempvc_lock' || interaction.customId === 'tempvc_unlock') {
    const shouldLock = interaction.customId === 'tempvc_lock';
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
      Connect: !shouldLock,
      ViewChannel: true
    });
    await updateTempVcFlags(channel.id, { isLocked: shouldLock });
    await interaction.reply({
      content: shouldLock ? '🔒 Salon verrouillé.' : '🔓 Salon déverrouillé.',
      ephemeral: true
    });
    return { success: true, message: 'BUTTON_HANDLED' };
  }

  if (interaction.customId === 'tempvc_hide' || interaction.customId === 'tempvc_unhide') {
    const shouldHide = interaction.customId === 'tempvc_hide';
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
      ViewChannel: !shouldHide,
      Connect: true
    });
    await updateTempVcFlags(channel.id, { isHidden: shouldHide });
    await interaction.reply({
      content: shouldHide ? '🙈 Salon caché.' : '👁️ Salon visible.',
      ephemeral: true
    });
    return { success: true, message: 'BUTTON_HANDLED' };
  }

  if (interaction.customId === 'tempvc_toggle_autoplay') {
    const nextValue = !record.autoPlayRadio;
    await updateTempVcFlags(channel.id, { autoPlayRadio: nextValue });

    if (nextValue) {
      await startRadioInVoiceChannel(channel);
    } else {
      stopRadioForTempChannel(channel.id);
    }

    await interaction.reply({
      content: `📻 Auto-play radio ${nextValue ? 'activé' : 'désactivé'} pour ce salon.`,
      ephemeral: true
    });
    return { success: true, message: 'BUTTON_HANDLED' };
  }

  return null;
}

export async function handleTempVcModal (interaction) {
  if (!interaction.customId.startsWith('tempvc_modal_')) return null;

  const [,, action, channelId] = interaction.customId.split('_');
  const channel = interaction.guild.channels.cache.get(channelId);

  if (!channel || channel.type !== ChannelType.GuildVoice) {
    await interaction.reply({ content: '❌ Salon introuvable.', ephemeral: true });
    return { success: true, message: 'MODAL_HANDLED' };
  }

  const record = await getTempVcChannelRecord(channel.id);
  const rights = await assertManageRights(interaction, record);
  if (!rights.ok) {
    await interaction.reply({ content: rights.message, ephemeral: true });
    return { success: true, message: 'MODAL_HANDLED' };
  }

  if (action === 'rename') {
    const newName = interaction.fields.getTextInputValue('name').trim();
    await channel.setName(newName);
    renameCooldown.set(interaction.user.id, Date.now());
    await interaction.reply({
      content: `✅ Salon renommé: **${newName}**`,
      ephemeral: true
    });
    return { success: true, message: 'MODAL_HANDLED' };
  }

  if (action === 'limit') {
    const rawValue = interaction.fields.getTextInputValue('limit').trim();
    const parsed = Number(rawValue);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99) {
      await interaction.reply({
        content: '❌ Valeur invalide. Entre 0 et 99.',
        ephemeral: true
      });
      return { success: true, message: 'MODAL_HANDLED' };
    }

    await channel.setUserLimit(parsed);
    await interaction.reply({
      content: `✅ Limite définie sur **${parsed}**.`,
      ephemeral: true
    });
    return { success: true, message: 'MODAL_HANDLED' };
  }

  return null;
}

export function isTempVcButton (customId) {
  return customId.startsWith('tempvc_');
}
