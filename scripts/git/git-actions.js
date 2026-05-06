#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import chalk from 'chalk';

const testEnv = {
  NODE_ENV: 'test',
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: 'test-client-id',
  API_PORT: '3000',
  BOT_TOKEN: 'test-bot-token',
  UNSPLASH_ACCESS_KEY: 'test-unsplash-key',
  STREAM_URL: 'test-stream-url',
  JSON_URL: 'test-json-url',
  ADMIN_ROLE_ID: 'test-admin-role',
  VOICE_CHANNEL_ID: 'test-voice-channel',
  PLAYLIST_CHANNEL_ID: 'test-playlist-channel',
  API_TOKEN: 'test-api-token',
  BOT_ROLE_NAME: 'soundSHINE',
  DEV_GUILD_ID: 'test-dev-guild'
};

function checkDependencies () {
  return existsSync('node_modules') && existsSync('node_modules/.bin');
}

function runCommand (command, description, env = {}) {
  console.log(chalk.blue(`\n${description}...`));

  try {
    const fullEnv = { ...process.env, ...env };
    execSync(command, {
      stdio: 'inherit',
      env: fullEnv,
      encoding: 'utf8'
    });
    console.log(chalk.green(`${description} - success`));
    return true;
  } catch (error) {
    console.error(chalk.red(`${description} - failed`));
    console.error(chalk.red(`Command: ${command}`));
    console.error(chalk.red(`Error: ${error.message}`));
    return false;
  }
}

function checkFileExists (filePath) {
  if (!existsSync(filePath)) {
    console.error(chalk.red(`Missing file: ${filePath}`));
    return false;
  }

  return true;
}

async function runGitActions () {
  console.log(chalk.bold.cyan('\nLocal GitHub Actions simulation'));
  console.log(chalk.gray('='.repeat(60)));

  let allChecksPassed = true;
  const startTime = Date.now();

  console.log(chalk.blue('\nChecking essential files...'));
  const essentialFiles = [
    'package.json',
    'src/index.js',
    'src/config/eslint.config.js',
    'src/config/vitest.config.js',
    '.github/workflows/ci.yml'
  ];

  for (const file of essentialFiles) {
    if (!checkFileExists(file)) {
      allChecksPassed = false;
    }
  }

  if (!allChecksPassed) {
    console.error(chalk.red('\nEssential files are missing. Aborting checks.'));
    process.exit(1);
  }

  if (!checkDependencies()) {
    console.log(chalk.yellow('\nDependencies are missing. Installing them first...'));
    if (!runCommand('npm install', 'Installing dependencies')) {
      process.exit(1);
    }
  } else {
    console.log(chalk.green('\nDependencies already installed.'));
  }

  if (!runCommand('npm run lint', 'Running lint')) {
    allChecksPassed = false;
  }

  if (!runCommand('npm run test:coverage', 'Running coverage tests', testEnv)) {
    allChecksPassed = false;
  }

  console.log(chalk.yellow('\nFormat check skipped: no formatter script is configured.'));

  if (!runCommand('npm run test:integration', 'Running integration tests', testEnv)) {
    allChecksPassed = false;
  }

  if (!runCommand('npm run test:performance', 'Running performance tests', testEnv)) {
    allChecksPassed = false;
  }

  console.log(chalk.blue('\nChecking Node.js syntax on key files...'));
  const jsFiles = [
    'src/index.js',
    'src/api/index.js',
    'src/bot/config.js',
    'src/bot/events/interactionCreate.js',
    'src/bot/logger.js',
    'src/core/monitor.js'
  ];

  for (const file of jsFiles) {
    if (existsSync(file) && !runCommand(`node --check ${file}`, `Syntax check: ${file}`)) {
      allChecksPassed = false;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(chalk.bold.cyan(`\n${'='.repeat(60)}`));
  console.log(chalk.bold.cyan('Final results'));
  console.log(chalk.bold.cyan('='.repeat(60)));

  if (allChecksPassed) {
    console.log(chalk.bold.green('\nAll checks passed.'));
    console.log(chalk.green(`Total duration: ${duration}s`));
    process.exit(0);
  }

  console.log(chalk.bold.red('\nSome checks failed.'));
  console.log(chalk.red(`Total duration: ${duration}s`));
  process.exit(1);
}

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('\nUnhandled rejection:'), reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('\nUncaught exception:'), error);
  process.exit(1);
});

runGitActions().catch((error) => {
  console.error(chalk.red('\nFatal error:'), error);
  process.exit(1);
});
