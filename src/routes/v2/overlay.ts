import { fetchOdyPlayer } from '../../core/players/odysseyPlayers';
import { getCharacterFromDevName } from '../../core/utils';
import { FastifyPluginAsync } from 'fastify';
import { fetchCachedPlayer } from '../../core/players/misc';
import { PilotDataType, RankDataType, TeamDataType } from '../../types/overlay';
import { prisma } from '../../plugins/prisma';

const overlay: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:username', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { username } = req.params as { username: string };
    let { region } = req.query as { region?: string };

    region = region ?? 'Global';

    const cachedPlayer = await fetchCachedPlayer(username);
    const odysseyPlayer = await fetchOdyPlayer(username, cachedPlayer);

    const lbQuery = await prometheusService.ranked.leaderboard.search(odysseyPlayer.playerId, 0, 0, region);
    const lbPlayer = lbQuery.players[0];

    const ratingsByNewest = await prisma.playerRating.findMany({
      where: { playerId: odysseyPlayer.playerId },
      orderBy: { createdAt: 'asc' },
    });

    // Player Stats
    const statsObject = await prometheusService.stats.player(odysseyPlayer.playerId);
    const playerStats = statsObject.playerStats[1]; // 0 is None, 1 is Ranked, 2 is Norms

    // Putting the badges together now
    let pilotBadges: {
      name: string
    }[] = []

    try {
      // Other badge data
      const mainCharacter = lbPlayer.mostPlayedCharacters[0].characterId;
      const gamesAmt = playerStats.roleStats.Forward.games + playerStats.roleStats.Goalie.games;
      const forwardRatio = playerStats.roleStats.Forward.games / (gamesAmt) * 100
      const scoresAmt = playerStats.roleStats.Forward.scores + playerStats.roleStats.Goalie.scores;
      const knockoutsAmt = playerStats.roleStats.Forward.knockouts + playerStats.roleStats.Goalie.knockouts;
      const assistsAmt = playerStats.roleStats.Forward.assists + playerStats.roleStats.Goalie.assists;

      pilotBadges.push({
        name: `${getCharacterFromDevName(mainCharacter).name || 'Omega Strikers'} Enjoyer`
      });

      pilotBadges.push({
        name: forwardRatio > 59.9 ? '🦐 Forward' : forwardRatio < 40.1 ? '🥅 Goalie' : '💫 Flex'
      });

      if (scoresAmt / gamesAmt >= 3) {pilotBadges.push({name: '🎯 Scorer',})}
      if (knockoutsAmt / gamesAmt >= 4) {pilotBadges.push({name: '🥊 Brawller',})}
      if (assistsAmt / gamesAmt >= 3) { pilotBadges.push({ name:  '🤝 Pass King',})}
    } catch {
      console.error(`Player (${username}) doesn't have any roleStats data! Returning defaults...`);
      pilotBadges.push({
        name: `Omega Strikers Enjoyer`
      });
    }

    const highestRatingIndex = ratingsByNewest.map(r => r.rating).indexOf(Math.max(...ratingsByNewest.map(r => r.rating)));
    const peakRating = ratingsByNewest[highestRatingIndex];

    const masteryData = await prometheusService.mastery.player(odysseyPlayer.playerId);

    const pilotCardData: PilotDataType = {
      username: username,
      title: odysseyPlayer.titleId,
      emoticon: odysseyPlayer.emoticonId,
      badges: pilotBadges,
      masteryLevel: masteryData.currentLevel,
      nextMasteryXp: masteryData.xpToNextLevel,
      currentMasteryXp: masteryData.currentLevelXp,
      tags: odysseyPlayer.tags,
      socialUrl: odysseyPlayer.socialUrl,
      teamData: cachedPlayer.teams,
      playerStatus: "Offline",
    };

    const rankCardData: RankDataType = {
      rank: lbPlayer.rank,
      rating: lbPlayer.rating,
      region: 'Global',
      wins: lbPlayer.wins,
      losses: lbPlayer.losses,
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