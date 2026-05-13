export default {
  builder: (subcommand) =>
    subcommand
      .setName('cache-clear')
      .setDescription('Vide le cache applicatif en mémoire'),

  async execute (_interaction, context) {
    const removed = context.services?.cache?.clear?.() ?? 0;
    return {
      success: true,
      message: `🧹 Cache vidé: ${removed} entrées supprimées.`,
      ephemeral: true
    };
  }
};
