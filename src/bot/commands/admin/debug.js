export function buildDebugGroup (group) {
  return group
    .setName('debug')
    .setDescription('Debug runtime')
    .addSubcommand(sub => sub.setName('voice').setDescription('Etat voix'))
    .addSubcommand(sub => sub.setName('stage').setDescription('Etat stage monitor'))
    .addSubcommand(sub => sub.setName('memory').setDescription('Etat mémoire process'))
    .addSubcommand(sub => sub.setName('cache').setDescription('Etat cache runtime'))
    .addSubcommand(sub => sub.setName('commands').setDescription('Etat des commandes chargées'))
    .addSubcommand(sub => sub.setName('services').setDescription('Etat du conteneur de services'));
}

// Compat backward: reconnu comme module sous-commande/helper.
export default {
  builder: buildDebugGroup
};

export async function handleDebugGroup (subcommand, interaction, context) {
  if (subcommand === 'voice') {
    const me = interaction.guild?.members?.me;
    const channel = me?.voice?.channel;
    return {
      success: true,
      message:
        '🎙️ Voice Debug\n'
        + `- connected: ${Boolean(channel)}\n`
        + `- channel: ${channel?.name || 'none'}\n`
        + `- channelId: ${channel?.id || 'n/a'}`,
      ephemeral: true
    };
  }

  if (subcommand === 'stage') {
    const status = context.services?.stage?.getStatus?.() || {};
    return {
      success: true,
      message:
        '🎭 Stage Debug\n'
        + `- monitoring: ${status.isMonitoring ?? false}\n`
        + `- connectedStages: ${status.connectedStages ?? 0}\n`
        + `- emptyStages: ${status.emptyStages ?? 0}\n`
        + `- checkInterval: ${status.checkInterval ?? 'n/a'}`,
      ephemeral: true
    };
  }

  if (subcommand === 'memory') {
    const mem = process.memoryUsage();
    return {
      success: true,
      message:
        '🧠 Memory Debug\n'
        + `- rss: ${Math.round(mem.rss / 1024 / 1024)} MB\n`
        + `- heapUsed: ${Math.round(mem.heapUsed / 1024 / 1024)} MB\n`
        + `- heapTotal: ${Math.round(mem.heapTotal / 1024 / 1024)} MB\n`
        + `- external: ${Math.round(mem.external / 1024 / 1024)} MB`,
      ephemeral: true
    };
  }

  if (subcommand === 'cache') {
    const stats = context.services?.cache?.getStats?.() || {};
    return {
      success: true,
      message:
        '🗃️ Cache Debug\n'
        + `- size: ${stats.size || 0}\n`
        + `- hits: ${stats.hits || 0}\n`
        + `- misses: ${stats.misses || 0}\n`
        + `- sets: ${stats.sets || 0}\n`
        + `- deletes: ${stats.deletes || 0}`,
      ephemeral: true
    };
  }

  if (subcommand === 'commands') {
    const names = Array.from(context.client.commands?.keys?.() || []).sort();
    return {
      success: true,
      message:
        '📦 Commands Debug\n'
        + `- total: ${names.length}\n`
        + `- sample: ${names.slice(0, 20).join(', ') || 'none'}`,
      ephemeral: true
    };
  }

  if (subcommand === 'services') {
    const keys = Object.keys(context.services || {});
    return {
      success: true,
      message:
        '🧩 Services Debug\n'
        + `- registered: ${keys.join(', ') || 'none'}\n`
        + `- cache: ${context.services?.cache ? 'OK' : 'MISSING'}\n`
        + `- radio: ${context.services?.radio ? 'OK' : 'MISSING'}\n`
        + `- stage: ${context.services?.stage ? 'OK' : 'MISSING'}`,
      ephemeral: true
    };
  }

  return {
    success: false,
    message: '❌ Sous-commande debug inconnue.',
    ephemeral: true
  };
}
