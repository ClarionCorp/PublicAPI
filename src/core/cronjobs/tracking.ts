import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';

const tempLogger = appLogger('Tracking');

export async function checkTrackingUpdates() {
  try {
    const trackedNum = await prisma.trackedPlayers.count();
    if (trackedNum > 0) {
      tempLogger.debug(`Currently updating for ${trackedNum} tracked players!`);
      await purgePlayers();
      await updatePlayers();
    }
  } catch (e) {
    tempLogger.error('Error in tracking cronjob:', e);
  }
}

// Remove inactive players
async function purgePlayers() {
  const trackedPlayers = await prisma.trackedPlayers.findMany();

  for (const player of trackedPlayers) {
    try {
      const latestLogged = await prisma.tempRating.findFirst({
        where: { username: player.username },
        orderBy: { loggedAt: 'desc' },
      });

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // Current time minus 2 hours
      if (latestLogged.loggedAt > twoHoursAgo) // entry is newer than 2 hours
        return

      // Delete this player's entries, they've expired.
      await prisma.trackedPlayers.delete({
        where: { username: player.username }
      })

      tempLogger.warn(`Deleted temp ratings for expired player: ${player.username}`);
    
    } catch (e) {
      tempLogger.error(`An unknown error occurred:`, e);
      continue;
    }
  } 
}

// Update stats for remaining players
async function updatePlayers() {
    const trackedPlayers = await prisma.trackedPlayers.findMany();

    for (const player of trackedPlayers) {
      try {
        const lbQuery = await prometheusService.ranked.leaderboard.search(player.userId, 0, 0, 'Global');
        const latestRating = lbQuery.players[0].rating;

        const latestLogged = await prisma.tempRating.findFirst({
          where: { username: player.username },
          orderBy: { loggedAt: 'desc' },
        });

        // Don't add duplicates
        if (latestLogged.rating == latestRating) {
          tempLogger.verbose(`Skipped adding duplicate rating for '${player.username}'.`);
          continue;
        }
  
        // This is a new rating now :D
        await prisma.tempRating.create({
          data: {
            username: player.username,
            rating: latestRating,
            loggedAt: new Date(), // Timestamp for rating entry
          },
        });
  
        tempLogger.info(`Added new rating for player ${player.username}: ${latestRating}`);
      
      } catch {
        tempLogger.error(`Player '${player.username}' has no leaderboard presence!`);
        continue;
      }
    }  
}