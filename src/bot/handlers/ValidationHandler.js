// ========================================
// bot/events/handlers/ValidationHandler.js - Validation des interactions Discord
// ========================================

import validator from '#shared/validation/validation.js';

function validateDiscordIdSafe (id) {
  try {
    validator.validateDiscordId(id);
    return true;
  } catch {
    return false;
  }
}

function validateSuggestion (input) {
  const sanitized = validator.sanitize(input, { maxLength: 200 });
  if (!sanitized || sanitized.length < 1) {
    throw new Error('Invalid suggestion value');
  }
  return sanitized;
}

/**
   * Valider et sanitiser les entrées de l'interaction
   */
export async function validateInteractionInput (interaction) {
  try {
    const userId = interaction.user.id;

    // Validation de base
    if (!validateDiscordIdSafe(userId)) {
      return { valid: false, error: 'ID utilisateur invalide' };
    }

    if (interaction.guildId && !validateDiscordIdSafe(interaction.guildId)) {
      return { valid: false, error: 'ID serveur invalide' };
    }

    // Validation spécifique selon le type d'interaction
    if (interaction.isChatInputCommand()) {
      return await validateChatInputCommand(interaction);
    } else if (interaction.isButton()) {
      return await validateButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      return await validateModalSubmit(interaction);
    } else if (interaction.isSelectMenu()) {
      return await validateSelectMenu(interaction);
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Erreur de validation de la commande',
      input: {
        commandName: interaction.commandName || interaction.customId,
        options: interaction.options?.data
      }
    };
  }
}

/**
   * Valider une commande slash
   */
async function validateChatInputCommand (interaction) {
  const { commandName } = interaction;
  const { options } = interaction;

  try {
    // Validation spécifique par commande
    switch (commandName) {
    case 'suggestion':
    case 'suggest': {
      return validateSuggestionCommand(interaction, options);
    }

    case 'ban':
    case 'kick': {
      return validateModerationCommand(interaction, options);
    }

    case 'config': {
      return validateConfigCommand(interaction, options);
    }

    case 'suggest-delete': {
      return validateSuggestionDeleteCommand(interaction, options);
    }

    case 'suggest-edit': {
      return validateSuggestionEditCommand(interaction, options);
    }

    case 'list_suggestions': {
      // Pas de validation spéciale nécessaire pour cette commande
      break;
    }

    default:
      break;
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Erreur de validation de la commande',
      input: { commandName, options: options?.data }
    };
  }
}

/**
   * Valider une commande de suggestion
   */
function validateSuggestionCommand (interaction, options) {
  const titre = options.getString('titre');
  const artiste = options.getString('artiste');

  if (!titre) {
    return { valid: false, error: 'Le titre est requis' };
  }

  if (!artiste) {
    return { valid: false, error: 'L\'artiste est requis' };
  }

  const validatedTitre = validateSuggestion(titre, interaction.user.id);
  const validatedArtiste = validateSuggestion(artiste, interaction.user.id);

  // Mettre à jour les options avec les valeurs validées
  options._hoistedOptions = options._hoistedOptions.map((opt) => {
    if (opt.name === 'titre') {
      return { ...opt, value: validatedTitre };
    }
    if (opt.name === 'artiste') {
      return { ...opt, value: validatedArtiste };
    }
    return opt;
  });

  return { valid: true };
}

/**
   * Valider une commande de modération
   */
function validateModerationCommand (interaction, options) {
  const targetUser = options.getUser('user');
  if (!targetUser) {
    return { valid: false, error: 'Utilisateur cible requis' };
  }

  if (!validateDiscordIdSafe(targetUser.id)) {
    return { valid: false, error: 'ID utilisateur cible invalide' };
  }

  const reason = options.getString('reason');
  if (reason) {
    const sanitizedReason = validator.sanitize(reason, { maxLength: 500 });
    options._hoistedOptions = options._hoistedOptions.map((opt) =>
      opt.name === 'reason' ? { ...opt, value: sanitizedReason } : opt);
  }

  return { valid: true };
}

/**
   * Valider une commande de configuration
   */
function validateConfigCommand (interaction, options) {
  const configKey = options.getString('key');
  const configValue = options.getString('value');

  if (configKey && !(/^[a-zA-Z0-9._-]+$/).test(configKey)) {
    return { valid: false, error: 'Clé de configuration invalide' };
  }

  if (configValue) {
    const sanitizedValue = validator.sanitize(configValue, { maxLength: 1000 });
    options._hoistedOptions = options._hoistedOptions.map((opt) =>
      opt.name === 'value' ? { ...opt, value: sanitizedValue } : opt);
  }

  return { valid: true };
}

/**
   * Valider une commande de suppression de suggestion
   */
function validateSuggestionDeleteCommand (interaction, options) {
  const suggestionId = options.getInteger('id');
  if (!suggestionId || suggestionId <= 0) {
    return { valid: false, error: 'ID de suggestion invalide' };
  }
  return { valid: true };
}

/**
   * Valider une commande d'édition de suggestion
   */
function validateSuggestionEditCommand (interaction, options) {
  const suggestionId = options.getInteger('id');
  if (!suggestionId || suggestionId <= 0) {
    return { valid: false, error: 'ID de suggestion invalide' };
  }

  const newTitre = options.getString('titre');
  const newArtiste = options.getString('artiste');

  if (newTitre) {
    const validatedTitre = validateSuggestion(newTitre, interaction.user.id);
    options._hoistedOptions = options._hoistedOptions.map((opt) =>
      opt.name === 'titre' ? { ...opt, value: validatedTitre } : opt);
  }

  if (newArtiste) {
    const validatedArtiste = validateSuggestion(newArtiste, interaction.user.id);
    options._hoistedOptions = options._hoistedOptions.map((opt) =>
      opt.name === 'artiste' ? { ...opt, value: validatedArtiste } : opt);
  }

  return { valid: true };
}

/**
   * Valider une interaction de bouton
   */
async function validateButtonInteraction (interaction) {
  const { customId } = interaction;

  try {
    // Validation des IDs de bouton personnalisés
    if (!(/^[a-zA-Z0-9_-]+$/).test(customId)) {
      return { valid: false, error: 'ID de bouton invalide' };
    }

    // Validation spécifique selon le type de bouton
    if (customId.startsWith('suggestion_')) {
      const suggestionId = customId.replace('suggestion_', '');
      if (!(/^\d+$/).test(suggestionId)) {
        return { valid: false, error: 'ID de suggestion invalide' };
      }
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Erreur de validation du bouton',
      input: customId
    };
  }
}

/**
   * Valider une soumission de modal
   */
async function validateModalSubmit (interaction) {
  const { customId } = interaction;
  const { fields } = interaction;

  try {
    // Validation de l'ID du modal
    if (!(/^[a-zA-Z0-9_-]+$/).test(customId)) {
      return { valid: false, error: 'ID de modal invalide' };
    }

    // Validation des champs selon le type de modal
    if (customId === 'suggestion_modal') {
      const suggestionText = fields.getTextInputValue('suggestion_text');
      if (!suggestionText) {
        return { valid: false, error: 'Le texte de suggestion est requis' };
      }

      const validatedSuggestion = validateSuggestion(suggestionText, interaction.user.id);
      // Mettre à jour le champ avec la valeur validée
      fields._components = fields._components.map((component) =>
        component.customId === 'suggestion_text'
          ? { ...component, value: validatedSuggestion }
          : component);
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Erreur de validation du modal',
      input: { customId, fields: fields?.data }
    };
  }
}

/**
   * Valider un menu de sélection
   */
async function validateSelectMenu (interaction) {
  const { customId } = interaction;
  const { values } = interaction;

  try {
    // Validation de l'ID du menu
    if (!(/^[a-zA-Z0-9_-]+$/).test(customId)) {
      return { valid: false, error: 'ID de menu invalide' };
    }

    // Validation des valeurs sélectionnées
    if (values && values.length > 0) {
      for (const value of values) {
        if (!(/^[a-zA-Z0-9_-]+$/).test(value)) {
          return { valid: false, error: 'Valeur de sélection invalide' };
        }
      }
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Erreur de validation du menu',
      input: { customId, values }
    };
  }
}
