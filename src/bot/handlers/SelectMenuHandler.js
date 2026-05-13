import { MessageFlags } from 'discord.js';
// ========================================
// bot/events/handlers/SelectMenuHandler.js - Gestion des menus de sélection
// ========================================

/**
 * Traiter un menu de sélection
 */
export async function handleSelectMenu (_interaction, _client, _db, _config) {
  // Traitement des menus de sélection...
  return {
    success: true,
    message: '✅ Sélection effectuée avec succès!',
    flags: MessageFlags.Ephemeral
  };
}
