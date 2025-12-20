import { fetchOdyPlayer } from '../../core/players/odysseyPlayers';
import { FastifyPluginAsync } from 'fastify';
import { fetchCachedPlayer } from '../../core/players/misc';
import { PilotBadge, PilotDataType, RankDataType } from '../../types/overlay';
import { prisma } from '../../plugins/prisma';
import { getTitleFromID } from '../../core/tools/titles';
import { fetchPlayerMastery, fetchPlayerStats, fetchRankedPlayer } from '../../core/prometheus';

const overlay: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:username', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { username } = req.params as { username: string };
    let { region } = req.query as { region?: string };

    if (region == 'Global') { region = undefined }; // don't allow forcing global

    const cachedPlayer = await fetchCachedPlayer(username);
    const odysseyPlayer = await fetchOdyPlayer(username, cachedPlayer);

    const globalQuery = await fetchRankedPlayer(odysseyPlayer.playerId, 0, 0, 'Global');
    const globalPlayer = globalQuery.players[0];

    const localQuery = await fetchRankedPlayer(odysseyPlayer.playerId, 0, 0, region ? region : cachedPlayer.region);
    const localPlayer = localQuery.players[0];

    const ratingsByNewest = await prisma.playerRating.findMany({
      where: { playerId: odysseyPlayer.playerId },
      orderBy: { createdAt: 'asc' },
    });

    // Player Stats
    const statsObject = await fetchPlayerStats(odysseyPlayer.playerId);
    const playerStats = statsObject.playerStats[1]; // 0 is None, 1 is Ranked, 2 is Norms

    // Other badge data
    const mainCharacter = globalPlayer.mostPlayedCharacters.characterId;
    const gamesAmt = playerStats.roleStats.Forward.games + playerStats.roleStats.Goalie.games;
    const forwardRatio = playerStats.roleStats.Forward.games / (gamesAmt) * 100
    
    let position: 'FORWARD' | 'GOALIE' | 'FLEX';

    if (forwardRatio > 59.9) {
      position = 'FORWARD';
    } else if (forwardRatio < 40.1) {
      position = 'GOALIE';
    } else {
      position = 'FLEX';
    }

    let pilotBadges: PilotBadge = {
      forwardStats: playerStats.roleStats.Forward,
      goalieStats: playerStats.roleStats.Goalie,
      position,
      mostPlayedCharacter: mainCharacter,
    }

    const highestRatingIndex = ratingsByNewest.map(r => r.rating).indexOf(Math.max(...ratingsByNewest.map(r => r.rating)));
    const peakRating = ratingsByNewest[highestRatingIndex];

    const masteryData = await fetchPlayerMastery(odysseyPlayer.playerId);
    const getTitle = await getTitleFromID(odysseyPlayer.titleId);

    const pilotCardData: PilotDataType = {
      username: username,
      title: getTitle ? getTitle.en : odysseyPlayer.titleId,
      emoticon: odysseyPlayer.emoticonId,
      badgeData: pilotBadges,
      masteryLevel: masteryData.currentLevel,
      nextMasteryXp: masteryData.xpToNextLevel,
      currentMasteryXp: masteryData.currentLevelXp,
      tags: odysseyPlayer.tags,
      socialUrl: odysseyPlayer.socialUrl,
      teamData: cachedPlayer.teams,
      playerStatus: "Offline",
    };

    const rankCardData: RankDataType = {
      rank: globalPlayer.rank, // Global ranking
      rating: globalPlayer.rating,
      regionRanking: localPlayer.rank,
      region: cachedPlayer.region,
      wins: globalPlayer.wins,
      losses: globalPlayer.losses,
      key: ratingsByNewest[0].id,
      peakRating: peakRating.rating,
    }

    return reply.status(200).send({
      pilotData: pilotCardData,
      rankCard: rankCardData
    });
  });
};

export default overlay;