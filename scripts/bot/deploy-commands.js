// scripts/bot/deploy-commands.js
import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import process from "process";
import chalk from "chalk";
import { pathToFileURL } from "url";
dotenv.config();

const args = process.argv.slice(2);
const isDev = args.includes("--dev");
const isGlobal = args.includes("--global");
const shouldClear = args.includes("--clear");

const GUILD_ID = "1404225768992669808";
const CLIENT_ID = process.env.CLIENT_ID;
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN || !CLIENT_ID) {
  console.error(chalk.red("DISCORD_TOKEN ou CLIENT_ID manquant dans le fichier .env"));
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(TOKEN);

function getAllCommandFiles(dir) {
  let commandFiles = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      commandFiles = commandFiles.concat(getAllCommandFiles(fullPath));
    } else if (file.isFile() && file.name.endsWith(".js")) {
      commandFiles.push(fullPath);
    }
  }

  return commandFiles;
}

const commandFiles = getAllCommandFiles("src/bot/commands");
const commands = [];
const commandNameToFile = new Map();

for (const filePath of commandFiles) {
  const moduleExports = await import(pathToFileURL(filePath).href);
  const command = moduleExports.default;

  // Ignorer les sous-commandes (builder sans data)
  if (command?.builder && !command?.data) {
    console.log(chalk.gray(`Ignore (sous-commande): ${filePath}`));
    continue;
  }

  const isHelperModule
    = typeof moduleExports.buildConfigGroup === "function"
      || typeof moduleExports.buildReloadGroup === "function"
      || typeof moduleExports.buildDebugGroup === "function"
      || typeof moduleExports.handleConfigGroup === "function"
      || typeof moduleExports.handleReloadGroup === "function"
      || typeof moduleExports.handleDebugGroup === "function";

  if (!command?.data) {
    if (isHelperModule) {
      console.log(chalk.gray(`Ignore (module helper): ${filePath}`));
      continue;
    }

    console.warn(chalk.yellow(`La commande "${filePath}" n'a pas de propriete 'data'`));
    continue;
  }

  if (typeof command.data.toJSON === "function") {
    const commandName = command.data.name;

    if (commandNameToFile.has(commandName)) {
      console.warn(
        chalk.yellow(
          `Doublon "${commandName}" ignore: ${filePath} (deja defini dans ${commandNameToFile.get(commandName)})`
        )
      );
      continue;
    }

    commandNameToFile.set(commandName, filePath);
    commands.push(command.data.toJSON());
    console.log(chalk.green(`Ajoute: ${commandName}`));
  } else {
    console.warn(chalk.yellow(`'data' de "${filePath}" n'est pas un SlashCommandBuilder valide`));
  }
}

(async () => {
  try {
    if (shouldClear) {
      console.log(chalk.magentaBright("Suppression des commandes Slash existantes..."));

      if (isDev) {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
        console.log(chalk.green(`Toutes les commandes GUILD (${GUILD_ID}) supprimees.`));
      } else if (isGlobal) {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
        console.log(chalk.green("Toutes les commandes GLOBALES supprimees."));
      } else {
        console.error(chalk.red("Vous devez preciser --dev ou --global avec --clear"));
        process.exit(1);
      }

      process.exit(0);
    }

    if (isDev) {
      console.log(chalk.cyan("Deploiement des commandes a la GUILD..."));
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(chalk.green(`${commands.length} commandes deployees a la GUILD (${GUILD_ID})`));
    } else if (isGlobal) {
      console.log(chalk.cyan("Deploiement des commandes GLOBALES..."));
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log(chalk.green(`${commands.length} commandes globales deployees`));
    } else {
      console.error(chalk.red("Specifiez --dev ou --global pour deployer."));
      process.exit(1);
    }

    if (args.includes("--with-version")) {
      console.log(chalk.gray("Version tagging active (non implemente)"));
    }

    if (args.includes("--restart-service")) {
      console.log(chalk.gray("Restart du service demande (non implemente)"));
    }
  } catch (error) {
    console.error(chalk.red("Erreur lors du deploiement des commandes :"), error);
    process.exit(1);
  }
})();
