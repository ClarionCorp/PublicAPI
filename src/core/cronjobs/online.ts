import { appLogger } from "../../plugins/logger";
import { fetchDiscordFriends } from "../prometheus";
import { prisma } from "../../plugins/prisma";
import { PlayerStatus } from "../../../prisma/client";

const logger = appLogger('Online');

export async function refreshPlayerCount() {
  logger.info('Refreshing Player Count...');

  try {
    const onlineFriends = await fetchDiscordFriends();
    await prisma.onlinePlayers.deleteMany(); // flush db

    const db = await prisma.onlinePlayers.createMany({
      data: onlineFriends.friends.map((friend) => ({
        username: friend.username,
        userId: friend.playerId,
        status: friend.playerStatus.toUpperCase() as PlayerStatus
      })),
      skipDuplicates: true // just in case
    });
    logger.info(`Refreshed Player Count! (There's ${db.count.toString()} online)`)
  } catch (error) {
    logger.error(`Something went wrong while fetching online count!`, error);
  }
}