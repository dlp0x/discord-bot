import { vi } from 'vitest';

export function createRoleCache (roleIds = [], roles = []) {
  return {
    has: vi.fn((roleId) => roleIds.includes(roleId)),
    some: vi.fn((predicate) => roles.some(predicate))
  };
}

export function createOptions (values = {}) {
  const optionEntries = Object.entries(values).map(([name, value]) => ({
    name,
    value
  }));

  return {
    data: optionEntries,
    _hoistedOptions: optionEntries,
    getBoolean: vi.fn((name) => values[name] ?? null),
    getChannel: vi.fn((name, required = false) => {
      const value = values[name] ?? null;
      if (required && !value) throw new Error(`Missing channel option: ${name}`);
      return value;
    }),
    getInteger: vi.fn((name) => values[name] ?? null),
    getString: vi.fn((name) => values[name] ?? null),
    getSubcommand: vi.fn(() => values.subcommand)
  };
}

export function createInteraction (overrides = {}) {
  const roleIds = overrides.roleIds || [];
  const roles = overrides.roles || roleIds.map((id) => ({ id, name: id }));
  const options = overrides.options || createOptions(overrides.optionValues || {});

  return {
    channel: overrides.channel,
    client: overrides.client || { ws: { ping: 42 }, commands: new Map() },
    commandName: overrides.commandName || 'test',
    components: overrides.components || [],
    createdTimestamp: overrides.createdTimestamp ?? 1000,
    customId: overrides.customId,
    deferred: overrides.deferred || false,
    editReply: vi.fn(),
    fields: overrides.fields || {
      getTextInputValue: vi.fn((name) => overrides.fieldValues?.[name] ?? '')
    },
    fetchReply: vi.fn(async () => ({
      createdTimestamp: overrides.replyTimestamp ?? 1123
    })),
    followUp: vi.fn(),
    guild: overrides.guild,
    guildId: overrides.guildId || '123456789012345678',
    isButton: vi.fn(() => overrides.type === 'button'),
    isChatInputCommand: vi.fn(() => (overrides.type || 'command') === 'command'),
    isModalSubmit: vi.fn(() => overrides.type === 'modal'),
    isSelectMenu: vi.fn(() => overrides.type === 'select'),
    isStringSelectMenu: vi.fn(() => overrides.type === 'select'),
    member: overrides.member || {
      roles: { cache: createRoleCache(roleIds, roles) },
      voice: { channel: overrides.voiceChannel || null }
    },
    memberPermissions: overrides.memberPermissions || { has: vi.fn(() => false) },
    options,
    replied: overrides.replied || false,
    reply: vi.fn(),
    showModal: vi.fn(),
    type: overrides.type,
    update: vi.fn(),
    user: overrides.user || {
      id: '111111111111111111',
      tag: 'tester#0001',
      username: 'tester'
    },
    values: overrides.values || []
  };
}

export function createTempVoiceChannel (overrides = {}) {
  const members = overrides.memberIds || [];

  return {
    delete: vi.fn(),
    guild: overrides.guild || {
      id: '123456789012345678',
      roles: { everyone: { id: 'everyone' } },
      voiceAdapterCreator: {}
    },
    id: overrides.id || '555555555555555555',
    members: {
      has: vi.fn((memberId) => members.includes(memberId)),
      size: overrides.memberCount ?? members.length
    },
    name: overrides.name || 'Salon de tester',
    permissionOverwrites: {
      edit: vi.fn()
    },
    setName: vi.fn(),
    setUserLimit: vi.fn(),
    type: overrides.type ?? 2,
    userLimit: overrides.userLimit ?? 0
  };
}

export function lastReplyContent (interaction) {
  const call = interaction.reply.mock.calls.at(-1)?.[0];
  return typeof call === 'string' ? call : call?.content;
}
