import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DISCORD_TOKEN = 'test-token';
process.env.CLIENT_ID = 'test-client-id';
process.env.GUILD_ID = '123456789012345678';
process.env.ADMIN_ROLE_ID = '987654321098765432';
process.env.REQ_ROLE_ID = '222222222222222222';
process.env.PLAYLIST_CHANNEL_ID = '333333333333333333';
process.env.VOICE_CHANNEL_ID = '444444444444444444';
process.env.API_TOKEN = 'test-api-token';
process.env.API_PORT = '3000';
process.env.LOG_LEVEL = 'error';
process.env.JSON_URL = 'https://icecast.example.test/status-json.xsl';
process.env.STREAM_URL = 'https://stream.example.test/live.mp3';
process.env.RADIODJ_API_URL = 'https://radiodj.example.test/api';
process.env.RADIODJ_API_KEY = 'radiodj-key';

class ChainableBuilder {
  constructor () {
    this.data = {};
  }

  setName (name) {
    this.data.name = name;
    this.name = name;
    return this;
  }

  setDescription (description) {
    this.data.description = description;
    this.description = description;
    return this;
  }

  setDMPermission (value) {
    this.data.dmPermission = value;
    return this;
  }

  setDefaultMemberPermissions (value) {
    this.data.defaultMemberPermissions = value;
    return this;
  }

  addSubcommand (subcommand) {
    const value = typeof subcommand === 'function'
      ? subcommand(new ChainableBuilder())
      : subcommand;
    this.data.subcommands = [...(this.data.subcommands || []), value];
    return this;
  }

  addStringOption (callback) {
    if (callback) callback(new ChainableBuilder());
    return this;
  }

  addIntegerOption (callback) {
    if (callback) callback(new ChainableBuilder());
    return this;
  }

  addBooleanOption (callback) {
    if (callback) callback(new ChainableBuilder());
    return this;
  }

  addChannelOption (callback) {
    if (callback) callback(new ChainableBuilder());
    return this;
  }

  addChannelTypes (...types) {
    this.data.channelTypes = types;
    return this;
  }

  setRequired (value) {
    this.data.required = value;
    return this;
  }

  setMinValue (value) {
    this.data.minValue = value;
    return this;
  }

  setMaxValue (value) {
    this.data.maxValue = value;
    return this;
  }

  setCustomId (customId) {
    this.data.customId = customId;
    return this;
  }

  setLabel (label) {
    this.data.label = label;
    return this;
  }

  setStyle (style) {
    this.data.style = style;
    return this;
  }

  setURL (url) {
    this.data.url = url;
    return this;
  }

  setValue (value) {
    this.data.value = value;
    return this;
  }

  setTitle (title) {
    this.data.title = title;
    return this;
  }

  addComponents (...components) {
    this.data.components = components.flat();
    return this;
  }

  toJSON () {
    return this.data;
  }
}

class EmbedBuilder extends ChainableBuilder {
  setColor (color) {
    this.data.color = color;
    return this;
  }

  setDescription (description) {
    this.data.description = description;
    return this;
  }

  addFields (...fields) {
    this.data.fields = fields.flat();
    return this;
  }

  setFooter (footer) {
    this.data.footer = footer;
    return this;
  }

  setTimestamp (timestamp = new Date()) {
    this.data.timestamp = timestamp;
    return this;
  }
}

vi.mock('discord.js', () => ({
  ActionRowBuilder: ChainableBuilder,
  ButtonBuilder: ChainableBuilder,
  EmbedBuilder,
  ModalBuilder: ChainableBuilder,
  SlashCommandBuilder: ChainableBuilder,
  SlashCommandSubcommandBuilder: ChainableBuilder,
  StringSelectMenuBuilder: ChainableBuilder,
  TextInputBuilder: ChainableBuilder,
  ActivityType: { Listening: 2, Playing: 0, Streaming: 1, Watching: 3 },
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
  ChannelType: { GuildVoice: 2, GuildCategory: 4 },
  MessageFlags: { Ephemeral: 64 },
  PermissionFlagsBits: {
    Connect: 1n << 20n,
    DeafenMembers: 1n << 23n,
    ManageChannels: 1n << 4n,
    ManageGuild: 1n << 5n,
    MoveMembers: 1n << 24n,
    MuteMembers: 1n << 22n,
    Speak: 1n << 21n,
    ViewChannel: 1n << 10n
  },
  TextInputStyle: { Short: 1, Paragraph: 2 }
}));

vi.mock('@discordjs/voice', () => ({
  NoSubscriberBehavior: { Pause: 'pause' },
  StreamType: { Arbitrary: 'arbitrary' },
  createAudioPlayer: vi.fn(() => ({
    play: vi.fn(),
    stop: vi.fn()
  })),
  createAudioResource: vi.fn((url, options) => ({ url, options })),
  getVoiceConnection: vi.fn(() => null),
  joinVoiceChannel: vi.fn(() => ({
    subscribe: vi.fn(),
    destroy: vi.fn()
  }))
}));

vi.mock('#shared/logging/logger.js', () => ({
  default: {
    banner: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn()
  }
}));
