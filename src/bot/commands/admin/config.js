const SENSITIVE_PATTERNS = ['TOKEN', 'SECRET', 'PASSWORD', 'API_KEY'];

export function buildConfigGroup (group) {
  return group
    .setName('config')
    .setDescription('Configuration runtime')
    .addSubcommand(sub =>
      sub
        .setName('show')
        .setDescription('Affiche la configuration générale'))
    .addSubcommand(sub =>
      sub
        .setName('services')
        .setDescription('Affiche l’état des services'))
    .addSubcommand(sub =>
      sub
        .setName('cache')
        .setDescription('Affiche la configuration cache'))
    .addSubcommand(sub =>
      sub
        .setName('monitoring')
        .setDescription('Affiche la configuration monitoring'));
}

// Compat backward: permet aux anciens loaders (default + builder)
// d'identifier ce module comme "sous-commande/helper".
export default {
  builder: buildConfigGroup
};

export async function handleConfigGroup (subcommand, _interaction, context) {
  if (subcommand === 'show') {
    return {
      success: true,
      message:
        '⚙️ Config\n'
        + `- NODE_ENV: ${context.config.NODE_ENV}\n`
        + `- LOG_LEVEL: ${context.config.LOG_LEVEL}\n`
        + `- API_PORT: ${context.config.API_PORT}\n`
        + `- CORS_ORIGIN: ${context.config.CORS_ORIGIN || '*'}\n`
        + `- STREAM_URL: ${maskValue('STREAM_URL', context.config.STREAM_URL)}\n`
        + `- JSON_URL: ${maskValue('JSON_URL', context.config.JSON_URL)}`,
      ephemeral: true
    };
  }

  if (subcommand === 'services') {
    return {
      success: true,
      message:
        '🧩 Services\n'
        + `- airtable: ${context.config.hasAirtable() ? 'ON' : 'OFF'}\n`
        + `- unsplash: ${context.config.hasUnsplash() ? 'ON' : 'OFF'}\n`
        + `- streaming: ${context.config.hasStreamService() ? 'ON' : 'OFF'}\n`
        + `- cache service: ${context.services?.cache ? 'READY' : 'MISSING'}\n`
        + `- radio service: ${context.services?.radio ? 'READY' : 'MISSING'}\n`
        + `- stage service: ${context.services?.stage ? 'READY' : 'MISSING'}`,
      ephemeral: true
    };
  }

  if (subcommand === 'cache') {
    const cacheStats = context.services?.cache?.getStats?.() || {};
    return {
      success: true,
      message:
        '🧠 Cache Config\n'
        + `- CACHE_TTL: ${context.config.CACHE_TTL}\n`
        + `- CACHE_MAX_SIZE: ${context.config.CACHE_MAX_SIZE}\n`
        + `- runtime size: ${cacheStats.size || 0}\n`
        + `- hits: ${cacheStats.hits || 0}\n`
        + `- misses: ${cacheStats.misses || 0}`,
      ephemeral: true
    };
  }

  if (subcommand === 'monitoring') {
    const stageStatus = context.services?.stage?.getStatus?.();
    return {
      success: true,
      message:
        '📈 Monitoring\n'
        + `- ENABLE_METRICS: ${context.config.ENABLE_METRICS}\n`
        + `- ENABLE_HEALTH_CHECK: ${context.config.ENABLE_HEALTH_CHECK}\n`
        + `- SILENCE_ALERTS_ENABLED: ${context.config.SILENCE_ALERTS_ENABLED}\n`
        + `- stage monitoring active: ${stageStatus?.isMonitoring ?? false}\n`
        + `- stages tracked: ${stageStatus?.connectedStages ?? 0}`,
      ephemeral: true
    };
  }

  return {
    success: false,
    message: '❌ Sous-commande config inconnue.',
    ephemeral: true
  };
}

function maskValue (key, value) {
  if (!value) return 'N/A';
  if (SENSITIVE_PATTERNS.some(pattern => key.includes(pattern))) return '[MASKED]';
  return String(value);
}
