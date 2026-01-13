import { FastifyPluginAsync } from 'fastify';
import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { MatchStatus, Role } from '../../../prisma/client';
import { getCharacterIdFromName } from '../../core/utils';
import { getMapIdFromName } from '../../objects/maps';
import { getRankThresholdFromName } from '../../core/ranks';

// Parse duration string like "11m 55s" to seconds
function parseDuration(durationStr: string): number {
  const matches = durationStr.match(/(?:(\d+)m)?\s*(?:(\d+)s)?/);
  if (!matches) return 0;
  const minutes = parseInt(matches[1] || '0', 10);
  const seconds = parseInt(matches[2] || '0', 10);
  return minutes * 60 + seconds;
}

// Parse time ago to approximate date
function parseTimeAgo(timeAgoStr: string): Date {
  const now = new Date();
  const match = timeAgoStr.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!match) return now;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'second': return new Date(now.getTime() - value * 1000);
    case 'minute': return new Date(now.getTime() - value * 60 * 1000);
    case 'hour': return new Date(now.getTime() - value * 60 * 60 * 1000);
    case 'day': return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    case 'week': return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
    case 'month': return new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000);
    case 'year': return new Date(now.getTime() - value * 365 * 24 * 60 * 60 * 1000);
    default: return now;
  }
}

const matches: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:username', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { username } = req.params as { username: string };
    const { refresh } = req.query as { refresh?: string };

    try {
      // Fetch the player page
      const response = await fetch(`https://stats.omegastrikers.gg/player/${username}`);
      if (!response.ok) {
        return reply.status(response.status).send({ error: 'Failed to fetch player data' });
      }

      const html = await response.text();
      const start = performance.now();
      const $ = cheerio.load(html);

      // Find the match-history div
      const matchHistory = $('.match-history');

      if (matchHistory.length === 0) {
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
        const firstMatchCard = $('.match-card', matchHistory).first();
        if (firstMatchCard.length > 0) {
          const firstMatchResult = firstMatchCard.hasClass('loss') ? MatchStatus.DEFEAT : MatchStatus.VICTORY;
          const firstMapName = firstMatchCard.find('.map-name').text();
          const firstDuration = parseDuration(firstMatchCard.find('.duration').text());

          // Check if a match with these characteristics exists
          const existingMatch = await fastify.prisma.matchHistory.findFirst({
            where: {
              playerId: player.id,
              map: firstMapName,
              result: firstMatchResult,
              duration: firstDuration
            },
            orderBy: { playedAt: 'desc' }
          });

          // If the most recent match exists, return cached data
          if (existingMatch) {
            const cachedMatches = await fastify.prisma.matchHistory.findMany({
              where: { playerId: player.id },
              include: { playerStats: true },
              orderBy: { playedAt: 'desc' }
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

      // First, collect all match data
      const matchDataArray: any[] = [];

      // Extract data from each match card
      $('.match-card', matchHistory).each((index: number, element: Element) => {
        const matchCard = $(element);

        // Match result (win/loss)
        const matchResult = matchCard.hasClass('loss') ? MatchStatus.DEFEAT : MatchStatus.VICTORY;

        // Character played
        const character = matchCard.find('.character-avatar').attr('alt') || 'Unknown';

        // Level badge
        const level = parseInt(matchCard.find('.match-badges .badge').first().text(), 10);

        // Role badge
        const roleText = matchCard.find('.match-badges .badge').eq(1).text();
        const role = roleText === 'Forward' ? Role.Forward : Role.Goalie;

        // Match metadata
        const mode = matchCard.find('.mode-label').text() || 'Ranked';
        const timeAgo = matchCard.find('.time-ago').text();
        const mapName = matchCard.find('.map-name').text();
        const duration = parseDuration(matchCard.find('.duration').text());
        // Offset each match by index * 10 seconds to maintain order (newer matches appear first)
        const playedAt = new Date(parseTimeAgo(timeAgo).getTime() - (index * 10 * 1000));

        // Bans
        const bans: string[] = [];
        matchCard.find('.match-bans img').each((_i: number, img: Element) => {
          bans.push($(img).attr('alt') || '');
        });

        // Average Tier
        const avgTier = matchCard.find('.match-tier .tier-name').text() || 'Unknown';

        // Awakenings
        const awakenings: string[] = [];
        matchCard.find('.match-awakenings img').each((_i: number, img: Element) => {
          awakenings.push($(img).attr('alt') || '');
        });

        // Detailed match table stats
        const playerItems: any[] = [];
        const detailsTable = matchCard.find('.match-details table tbody tr');

        detailsTable.each((_i: number, row: Element) => {
          const cols = $(row).find('td');

          // Team 1 player (badges: Level, Role)
          const team1Char = cols.eq(0).find('img').attr('alt') || 'Unknown';
          const team1Badges = cols.eq(0).find('.badge');
          const team1LevelBadge = team1Badges.filter('[title="Level"]');
          const team1RoleBadge = team1Badges.filter('[title="Role"]');
          const team1MvpBadge = team1Badges.filter('[title="MVP"]');
          const team1Level = parseInt(team1LevelBadge.text().trim(), 10) || 1;
          const team1RoleText = team1RoleBadge.text().trim();
          const team1Role = team1RoleText === 'Forward' ? Role.Forward : Role.Goalie;
          const team1IsMvp = team1MvpBadge.length > 0;
          const team1Awakenings: string[] = [];
          cols.eq(1).find('img').each((_idx: number, img: Element) => {
            team1Awakenings.push($(img).attr('title') || $(img).attr('alt') || '');
          });
          const team1Stats = cols.eq(2).text().trim().split('/');
          const team1UserLink = cols.eq(0).find('a').attr('href') || '';
          const team1UserId = team1UserLink.split('/').pop() || '';

          // Team 2 player (badges can include MVP, so filter by title attribute)
          const team2Char = cols.eq(5).find('img').attr('alt') || 'Unknown';
          const team2Badges = cols.eq(5).find('.badge');
          const team2LevelBadge = team2Badges.filter('[title="Level"]');
          const team2RoleBadge = team2Badges.filter('[title="Role"]');
          const team2MvpBadge = team2Badges.filter('[title="MVP"]');
          const team2Level = parseInt(team2LevelBadge.text().trim(), 10) || 1;
          const team2RoleText = team2RoleBadge.text().trim();
          const team2Role = team2RoleText === 'Forward' ? Role.Forward : Role.Goalie;
          const team2IsMvp = team2MvpBadge.length > 0;
          const team2Awakenings: string[] = [];
          cols.eq(4).find('img').each((_idx: number, img: Element) => {
            team2Awakenings.push($(img).attr('title') || $(img).attr('alt') || '');
          });
          const team2Stats = cols.eq(3).text().trim().split('/');
          const team2UserLink = cols.eq(5).find('a').attr('href') || '';
          const team2UserId = team2UserLink.split('/').pop() || '';

          playerItems.push({
            userId: team1UserId,
            team: 1,
            character: team1Char,
            role: team1Role,
            awakenings: team1Awakenings,
            level: team1Level,
            assists: parseInt(team1Stats[1], 10),
            scores: parseInt(team1Stats[0], 10),
            saves: parseInt(team1Stats[2], 10),
            knockouts: parseInt(team1Stats[3], 10),
            mvp: team1IsMvp,
          });

          playerItems.push({
            userId: team2UserId,
            team: 2,
            character: team2Char,
            role: team2Role,
            awakenings: team2Awakenings,
            level: team2Level,
            assists: parseInt(team2Stats[1], 10),
            scores: parseInt(team2Stats[0], 10),
            saves: parseInt(team2Stats[2], 10),
            knockouts: parseInt(team2Stats[3], 10),
            mvp: team2IsMvp,
          });
        });

        // Find MVP user ID from playerItems
        const mvpPlayer = playerItems.find(item => item.mvp === true);
        const mvpId = mvpPlayer?.userId || null;

        // Create unique match ID based on stable data to avoid duplicates
        const matchUniqueKey = `${player.id}-${character.toLowerCase().replace(/['\s]+/g, '-')}-${matchResult.toLowerCase()}-${mapName.toLowerCase().replace(/['\s]+/g, '-')}-${duration}-${mvpId || 'no-mvp'}`;

        matchDataArray.push({
          matchUniqueKey,
          map: mapName,
          role,
          mode,
          result: matchResult,
          duration,
          bans,
          avgRank: avgTier,
          playerId: player.id,
          mvpId,
          playedAt,
          playerItems
        });
      });

      // Collect all unique user IDs from all matches
      const allUserIds = new Set<string>();
      matchDataArray.forEach(matchData => {
        matchData.playerItems.forEach((item: any) => {
          if (item.userId) {
            allUserIds.add(item.userId);
          }
        });
      });

      // Batch lookup all usernames
      const playersInDb = await fastify.prisma.player.findMany({
        where: { id: { in: Array.from(allUserIds) } },
        select: { id: true, username: true }
      });

      // Create a map for quick username lookup
      const usernameMap = new Map(playersInDb.map(p => [p.id, p.username]));

      // Now create the database promises with usernames included
      const matchPromises: Promise<any>[] = matchDataArray.map(matchData => {
        // Add usernames to playerItems
        const playerItemsWithUsernames = matchData.playerItems.map((item: any) => ({
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
        where: { playerId: player.id },
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