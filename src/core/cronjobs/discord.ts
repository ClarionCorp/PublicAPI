import { LinkedDiscordAccounts } from "@/types/ccui";
import { appLogger } from "../../plugins/logger";
import { prisma } from "../../plugins/prisma";

const logger = appLogger('Discord');

// This fetches all Discord Accounts and linked Accounts from CCUI
// to forcefully update the database with instead of the apparently unreliable Ody API
export async function fetchLinkedDiscord() {
  logger.info('Querying CCUI for User Accounts...');

  try {
    const res = await fetch(`${process.env.CLARION_UI}/api/internal/sync/discord`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': process.env.SHARED_AUTH_TOKEN ?? 'None'
      }
    });

    if (!res.ok) { throw new Error(`CCUI incorrectly responded to the GET request! (${res.status}: ${res.statusText})`) };
    const data = await res.json() as LinkedDiscordAccounts[];
    logger.info(`Received ${data.length} user accounts...`);

    await prisma.$transaction(
      data.map(({ playerId, discordId }) =>
        prisma.player.update({
          where: { id: playerId },
          data: { discordId, forcedDID: true }
        })
      )
    );

    logger.info(`Updated all ${data.length} user accounts!`);

  } catch (error) {
    logger.error(`Something went wrong while talking to CCUI!`, error);
  }
}