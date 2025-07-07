import { PROMETHEUS } from '../../types/prometheus';
import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';
import { PlayerObjectType } from '../../types/players';

const ghostLogger = appLogger('Players/Ghosts')

// This handles all usernames with a "NOTSET" userId.
// Both the RESOLVER and the LEADERBOARD use this.
export async function handleCorestrike(cachedPlayer: PlayerObjectType, odysseyPlayer: PROMETHEUS.RAW.Player): Promise<PlayerObjectType> {
  if (cachedPlayer && cachedPlayer.id.includes('NOTSET')) {
    ghostLogger.warn(`PlayerId not set for user ${cachedPlayer.username}! Pulling now..`);
    ghostLogger.verbose(`${cachedPlayer.username}'s ID: ${odysseyPlayer.playerId}`);

    // Step 2: Get the player by the ID from the `usernameQuery`
    const existingPlayerById = await prisma.player.findUnique({
    where: { id: odysseyPlayer.playerId },
    });

    // Step 3: Get the player by the `username` from the `usernameQuery`
    const existingPlayerByUsername = await prisma.player.findUnique({
    where: { username: odysseyPlayer.username.toLocaleLowerCase() },
    });

    // Step 4: If the player with the same ID has a different username
    if (existingPlayerById && existingPlayerById.username !== odysseyPlayer.username.toLocaleLowerCase()) {
    // ghostLogger.warn(`Player with same ID also has a different username. (${existingPlayerById.username} vs ${odysseyPlayer.username}) Fixing...`);

    // Step 5: If a player with the new username also exists
    if (existingPlayerByUsername) {
      // Merge ratings from the old player (by username) into the player with the matching ID
      const oldRatings = await prisma.playerRating.findMany({
      where: { playerId: existingPlayerByUsername.id },
      });

      for (const oldRating of oldRatings) {
      // Ensure the rating doesn't already exist for the player with the matching ID
      const existingRatingForPlayer = await prisma.playerRating.findFirst({
        where: {
        playerId: existingPlayerById.id,
        createdAt: oldRating.createdAt,
        },
      });

      if (!existingRatingForPlayer) {
        await prisma.playerRating.create({
        data: {
          playerId: existingPlayerById.id,
          rating: oldRating.rating,
          createdAt: oldRating.createdAt,
        },
        });
      }
      }

      // Step 6: Delete the player with the username from the `usernameQuery`
      await prisma.player.delete({
      where: { id: existingPlayerByUsername.id },
      });

      // Step 7: Update the username of the player with the matching ID to the new username
      await prisma.player.update({
      where: { id: existingPlayerById.id },
      data: {
        username: odysseyPlayer.username.toLocaleLowerCase(),
      },
      });

      cachedPlayer.username = odysseyPlayer.username.toLocaleLowerCase();
      return cachedPlayer;
    } else {
      // If no matching username, just update the player's username
      await prisma.player.update({
      where: { id: existingPlayerById.id },
      data: {
        username: odysseyPlayer.username.toLocaleLowerCase(),
      },
      });

      cachedPlayer.username = odysseyPlayer.username.toLocaleLowerCase();
      return cachedPlayer;
    }
    } else {
    // If no ID match, handle as usual (e.g., create new player or return an error)
    await prisma.player.update({
      where: {
        username: cachedPlayer.username.toLocaleLowerCase(),
      },
      data: {
        id: odysseyPlayer.playerId,
      },
    });

    cachedPlayer.id = odysseyPlayer.playerId;
    return cachedPlayer;
    }
  }

  return cachedPlayer;
}

// This handles users populated through the leaderboard.
export async function handleGhosts() {

}