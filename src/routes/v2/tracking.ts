import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { TrackedPlayersStructure } from '../../types/overlay';
import { prisma } from '../../plugins/prisma';
import { appLogger } from '../../plugins/logger';
import { fetchUsernameQuery, fetchRankedPlayer } from '../../core/prometheus';

const logger = appLogger('Tracking');

const tracking: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:username', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { username } = req.params as { username: string };
    let { region } = req.query as { region?: string };

    region = region ?? 'Global';

    const trackedPlayer = await prisma.trackedPlayers.findUnique({
      where: { username: username },
      include: {
        tempRatings: true, // Fetch related tempRatings
      },
    });

    // User not found, start tracking and return first datapoint.
    if (!trackedPlayer) {
      const player = await addTrackedPlayer(username, reply);
      logger.info(`Started tracking for player: ${username}`);
      return reply.status(201).send(player);
    }
    else {
      logger.debug(`Sending tracking info for player: ${username}`);
      return reply.status(200).send({
        username: trackedPlayer.username,
        userId: trackedPlayer.userId,
        startedAt: trackedPlayer.startedAt,
        ratings: trackedPlayer.tempRatings
      });
    }
  });
};

async function addTrackedPlayer(username: string, reply: FastifyReply): Promise<TrackedPlayersStructure> {
  const odysseyPlayer = await fetchUsernameQuery(decodeURI(username));
  const lbQuery = await fetchRankedPlayer(odysseyPlayer.playerId, 0, 0, 'Global');
  const leaderboardPlayer = lbQuery.players[0]; // Grab our player (first result)

  if (leaderboardPlayer == undefined) {
    logger.error(`Player has no leaderboard presence!`);
    return reply.status(500).send({ error: 'Player has no leaderboard presence!'});
  }

  // Ensure there's only ONE entry for this player
  const newPlayer = await prisma.trackedPlayers.upsert({
    where: { username }, // Look for an existing record
    update: {}, // Do nothing if it exists
    create: {
      username,
      userId: odysseyPlayer.playerId,
      startedAt: new Date(),
    },
  });

  // Get a timestamp to ensure uniqueness
  const now = new Date();
  const loggedAtTimes = [now, new Date(now.getTime() - 1000)]; // -1 second

  // Insert initial ratings
  await prisma.tempRating.createMany({
    data: loggedAtTimes.map(loggedAt => ({
      username,
      rating: leaderboardPlayer.rating,
      loggedAt,
    })),
    skipDuplicates: true,
  });

  // Fetch the newly inserted ratings
  const ratings = await prisma.tempRating.findMany({
    where: {
      username,
      loggedAt: { in: loggedAtTimes }, // Only fetch what was just inserted
    },
    orderBy: { loggedAt: 'asc' }, // Ensure order
  });

  return {
    username: newPlayer.username,
    userId: newPlayer.userId,
    startedAt: newPlayer.startedAt,
    ratings, // Return the inserted ratings
  };
}

export default tracking;