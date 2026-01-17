import { FastifyPluginAsync } from 'fastify';
import { getCharacterIdFromName } from '../../core/utils';
import { getMapIdFromName } from '../../objects/maps';
import { getRankThresholdFromName } from '../../core/ranks';
import { parseFirstMatchForCache, parseMatchHistory, extractUserIds, hasMatchHistory } from '../../core/matches';

const matches: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:username', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { username } = req.params as { username: string };
    const { refresh, mode: modeFilter } = req.query as { refresh?: string; mode?: string };

    // Validate mode parameter if provided
    const validModes = ['Normal', 'Ranked'];
    if (modeFilter && !validModes.includes(modeFilter)) {
      return reply.status(400).send({ error: `Invalid mode. Accepted values: ${validModes.join(', ')}` });
    }

    try {
      // Fetch the player page
      const response = await fetch(`https://stats.omegastrikers.gg/player/${username}`);
      if (!response.ok) {
        return reply.status(response.status).send({ error: 'Failed to fetch player data' });
      }

      const html = await response.text();
      const start = performance.now();

      // Check if match history exists
      if (!hasMatchHistory(html)) {
        return reply.status(404).send({ error: 'No match history found' });
      }

      // Get player ID from database - try exact match first, then case insensitive
      let player = await fastify.prisma.player.findUnique({
        where: { username }
      });

      // If exact match fails, try case insensitive search
      if (!player) {
        const players = await fastify.prisma.player.findMany({
          where: {
            username: {
              equals: username,
              mode: 'insensitive'
            }
          },
          take: 1
        });
        player = players[0] || null;
      }

      // if (!player) {
      //   return reply.status(404).send({ error: 'Player not found in database' });
      // }

      // Check the first (most recent) match for caching (skip if refresh=true)
      if (refresh !== 'true') {
        const firstMatch = parseFirstMatchForCache(html);
        if (firstMatch) {
          // Check if a match with these characteristics exists
          const existingMatch = await fastify.prisma.matchHistory.findFirst({
            where: {
              playerId: player.id,
              map: firstMatch.map,
              result: firstMatch.result,
              duration: firstMatch.duration
            },
            orderBy: { playedAt: 'desc' }
          });

          // If the most recent match exists, return cached data
          if (existingMatch) {
            const cachedMatches = await fastify.prisma.matchHistory.findMany({
              where: {
                playerId: player.id,
                ...(modeFilter && { mode: modeFilter })
              },
              include: { playerStats: true },
              orderBy: { playedAt: 'desc' },
              take: 10
            });

            // Transform cached matches to add ID translations
            const transformedCachedMatches = cachedMatches.map(match => {
              const banIds = match.bans.map(banName => getCharacterIdFromName(banName) || null);

              return {
                ...match,
                mapId: getMapIdFromName(match.map) || null,
                avgRankThreshold: getRankThresholdFromName(match.avgRank) || null,
                banIds,
                playerStats: match.playerStats.map(playerStat => ({
                  ...playerStat,
                  characterId: getCharacterIdFromName(playerStat.character) || null,
                }))
              };
            });

            return reply.status(200).send({ calcTime: (performance.now() - start), matches: transformedCachedMatches });
          }
        }
      }

      // Parse all match data from HTML
      const matchDataArray = parseMatchHistory(html, player.id);

      // Extract all unique user IDs and batch lookup usernames
      const allUserIds = extractUserIds(matchDataArray);
      const playersInDb = await fastify.prisma.player.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, username: true }
      });

      // Create a map for quick username lookup
      const usernameMap = new Map(playersInDb.map(p => [p.id, p.username]));

      // Now create the database promises with usernames included
      const matchPromises: Promise<any>[] = matchDataArray.map(matchData => {
        // Add usernames to playerItems
        const playerItemsWithUsernames = matchData.playerItems.map((item) => ({
          ...item,
          username: usernameMap.get(item.userId) || null
        }));

        // Save to database
        return fastify.prisma.matchHistory.upsert({
          where: { id: matchData.matchUniqueKey },
          update: {},
          create: {
            id: matchData.matchUniqueKey,
            map: matchData.map,
            role: matchData.role,
            mode: matchData.mode,
            result: matchData.result,
            duration: matchData.duration,
            bans: matchData.bans,
            avgRank: matchData.avgRank,
            playerId: matchData.playerId,
            mvpId: matchData.mvpId,
            playedAt: matchData.playedAt,
            playerStats: {
              create: playerItemsWithUsernames
            }
          },
          include: {
            playerStats: true
          }
        });
      });

      // Wait for all matches to be saved
      await Promise.all(matchPromises);

      // Fetch and return the match history from database
      const savedMatches = await fastify.prisma.matchHistory.findMany({
        where: {
          playerId: player.id,
          ...(modeFilter && { mode: modeFilter })
        },
        include: { playerStats: true },
        orderBy: { playedAt: 'desc' },
        take: 10
      });

      // Transform the response to add ID translations
      const transformedMatches = savedMatches.map(match => {
        // Translate ban names to IDs
        const banIds = match.bans.map(banName => getCharacterIdFromName(banName) || null);

        return {
          ...match,
          mapId: getMapIdFromName(match.map) || null,
          avgRankThreshold: getRankThresholdFromName(match.avgRank) || null,
          banIds,
          playerStats: match.playerStats.map(playerStat => ({
            ...playerStat,
            characterId: getCharacterIdFromName(playerStat.character) || null,
          }))
        };
      });

      return reply.status(200).send({ calcTime: (performance.now() - start), matches: transformedMatches });

    } catch (error) {
      console.error('Error fetching match history:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};

export default matches;