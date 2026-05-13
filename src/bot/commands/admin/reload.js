import { loadCommands } from '../../handlers/loadCommands.js';

export function buildReloadGroup (group) {
  return group
    .setName('reload')
    .setDescription('Rechargement runtime')
    .addSubcommand(sub =>
      sub
        .setName('commands')
        .setDescription('Recharge les commandes'))
    .addSubcommand(sub =>
      sub
        .setName('monitors')
        .setDescription('Redémarre les monitors internes'))
    .addSubcommand(sub =>
      sub
        .setName('cache')
        .setDescription('Recharge/clear le cache runtime'));
}

// Compat backward: reconnu comme module sous-commande/helper.
export default {
  builder: buildReloadGroup
};

export async function handleReloadGroup (subcommand, _interaction, context) {
  if (subcommand === 'commands') {
    const before = context.client.commands?.size || 0;
    context.client.commands?.clear?.();
    const result = await loadCommands(context.client);
    const after = context.client.commands?.size || 0;

    return {
      success: true,
      message:
        `🔄 Commands reload\n`
        + `- before: ${before}\n`
        + `- after: ${after}\n`
        + `- loaded: ${result.loaded?.length || 0}\n`
        + `- failed: ${result.failed?.length || 0}`,
      ephemeral: true
    };
  }

  if (subcommand === 'monitors') {
    const stage = context.services?.stage;
    if (stage?.stopMonitoring && stage?.startMonitoring) {
      stage.stopMonitoring();
      stage.startMonitoring();
    }
    const status = stage?.getStatus?.();

    return {
      success: true,
      message:
        '🔄 Monitors reload\n'
        + `- stage active: ${status?.isMonitoring ?? false}\n`
        + `- stages tracked: ${status?.connectedStages ?? 0}`,
      ephemeral: true
    };
  }

  if (subcommand === 'cache') {
    const removed = context.services?.cache?.clear?.() ?? 0;
    return {
      success: true,
      message: `🔄 Cache reload done (${removed} entries cleared).`,
      ephemeral: true
    };
  }

  return {
    success: false,
    message: '❌ Sous-commande reload inconnue.',
    ephemeral: true
  };
}
