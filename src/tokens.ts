// Self-Contained Script designed for adding and managing access tokens.

import inquirer from "inquirer";
import { prisma } from './plugins/prisma';
import chalk from "chalk";
import Fastify from "fastify";
import jwt from '@fastify/jwt';

async function main() {
  let keepRunning = true;

  while (keepRunning) {
    console.clear();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          'Create a new Token',
          'Manage an existing Token',
          'Exit',
        ],
      },
    ]);

    if (action === 'Create a new Token') {
      await createToken();
    } else if (action === 'Manage an existing Token') {
      await manageTokens();
    } else if (action === 'Exit') {
      keepRunning = false;
      console.log('Goodbye!');
    }
  }
}


async function createToken() {
  const { tier, name, owner } = await inquirer.prompt([
    {
      type: 'number',
      name: 'tier',
      message: 'What tier of permission should be granted? (Leave blank for default (1)): ',
      default: 1,
      validate: (val) => (Number.isInteger(val) && val > 0) || 'Tier must be a positive integer',
    },
    {
      type: 'input',
      name: 'owner',
      message: 'Who owns this token?',
    },
    {
      type: 'input',
      name: 'name',
      message: `What project is this being used for?`,
    },
  ]);

  const fastify = Fastify({});
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'super-secret' // use .env in prod!
  })

  const tokenRecord = await prisma.userAccessToken.create({ data: { owner, name, tier }});

  const token = fastify.jwt.sign({
    id: tokenRecord.id,
    owner: tokenRecord.owner,
    name: tokenRecord.name
  })

  await prisma.userAccessToken.update({ where: { id: tokenRecord.id }, data: { token }});

  console.log('');
  console.log(chalk.greenBright(`Your JWT is: '${token}'`));
  console.log(chalk.gray('Please copy it now, it will not be shown again.'));
  console.log('');

  await keyToContinue();
  await fastify.close();
  return main();
}


async function manageTokens() {
  const registry = await prisma.userAccessToken.findMany({ where: { active: true }, orderBy: { id: 'asc' } });

  if (registry.length === 0) {
    console.log(chalk.redBright('No active tokens found.'));
    await keyToContinue();
    return main();
  };

  const { selectedId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedId',
      message: 'Select a token to manage:',
      choices: registry.map((entity) => ({
        name: `${entity.name} [#${entity.id}]`,
        value: entity.id,
      })),
    },
  ]);
  
  const token = registry.find((t) => t.id === selectedId)!;

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `What would you like to do with "${token.name}"?`,
      choices: ['Rename', 'Change Tier', 'Revoke Access', 'Cancel'],
    },
  ]);

  if (action === 'Rename') {
    const { newName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'newName',
        message: 'Enter the new name:',
        default: token.name,
      },
    ]);
    await prisma.userAccessToken.update({ where: { id: token.id }, data: { name: newName } });
    console.log(chalk.greenBright(`Token renamed to "${newName}".`));
    await keyToContinue();
    return main();
  }

  else if (action === 'Revoke Access') {
    await prisma.userAccessToken.update({ where: { id: token.id }, data: { active: false } });
    console.log(chalk.greenBright(`Token "${token.name}" revoked.`));
    await keyToContinue();
    return main();
  }

  // Higher gives more power
  else if (action === 'Change Tier') {
    const { newTier } = await inquirer.prompt([
      {
        type: 'number',
        name: 'newTier',
        message: `Current tier: ${token.tier}. Enter new tier:`,
        validate: (val) => (Number.isInteger(val) && val > 0) || 'Tier must be a positive integer',
      },
    ]);
    await prisma.userAccessToken.update({
      where: { id: token.id },
      data: { tier: newTier },
    });
    console.log(chalk.greenBright(`Tier updated to ${newTier}.`));
    await keyToContinue();
    return main();
  }

  else {
    return main();
  }
}

async function keyToContinue(message = 'Press any key to continue...'): Promise<void> {
  return new Promise((resolve) => {
    console.log(message);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    });
  });
}



main().catch(console.error);