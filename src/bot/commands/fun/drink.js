import { SlashCommandBuilder } from 'discord.js';

const drinks = [
  'Mojito 🍃',
  'Sex on the Beach 🍊',
  'Piña Colada 🍍',
  'Whisky on the rocks 🥃',
  'Vodka Red Bull ⚡',
  'Thé glacé au citron 🍋',
  'Eau pétillante💧',
  'Bière artisanale 🍺',
  'Café noir serré ☕',
  'Smoothie mangue-passion 🥭'
];

export default {
  meta: {
    category: 'fun',
    requiresAdmin: false,
    deferReply: false,
    ephemeral: false,
    cooldown: 5
  },

  data: new SlashCommandBuilder()
    .setName('drink')
    .setDescription('Offre un drink à quelqu’un')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('La personne à qui offrir un verre')
        .setRequired(true)),

  async execute (interaction, context = {}) {
    context.logger?.debug?.('[drink] execution');
    const target = interaction.options.getUser('user');
    const sender = interaction.user;

    if (target.id === sender.id) {
      return {
        success: true,
        message: `🤨 T'offrir un verre à toi-même ? Allez va... tiens, bois ça. *${randomDrink()}*`,
        ephemeral: false
      };
    }

    const drink = randomDrink();

    return {
      success: true,
      message: `🍸 **${sender.username}** offre un ${drink} à **${target.username}** ! Santé ! 🥂`,
      ephemeral: false
    };
  }
};

function randomDrink () {
  return drinks[Math.floor(Math.random() * drinks.length)];
}
