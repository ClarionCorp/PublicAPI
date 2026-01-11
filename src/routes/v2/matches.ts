import { FastifyPluginAsync } from 'fastify';
import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { MatchStatus, Role } from '../../../prisma/client';

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

    try {
      // Fetch the player page
      const response = await fetch(`https://stats.omegastrikers.gg/player/${username}`);
      if (!response.ok) {
        return reply.status(response.status).send({ error: 'Failed to fetch player data' });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Find the match-history div
      const matchHistory = $('.match-history');

      if (matchHistory.length === 0) {
        return reply.status(404).send({ error: 'No match history found' });
      }

      // Get player ID from database
      const player = await fastify.prisma.player.findUnique({
        where: { username }
      });

      if (!player) {
        return reply.status(404).send({ error: 'Player not found in database' });
      }

      const matchPromises: Promise<any>[] = [];

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

        // Stats
        const goals = parseInt(matchCard.find('.stat-line').eq(0).text().replace('Goals: ', ''), 10);
        const assists = parseInt(matchCard.find('.stat-line').eq(1).text().replace('Assists: ', ''), 10);
        const saves = parseInt(matchCard.find('.stat-line').eq(2).text().replace('Saves: ', ''), 10);
        const kos = parseInt(matchCard.find('.stat-line').eq(3).text().replace('KOs: ', ''), 10);

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
          const team1LevelText = team1Badges.eq(0).text().trim();
          const team1Level = parseInt(team1LevelText, 10) || 1;
          const team1RoleText = team1Badges.eq(1).text().trim();
          const team1Role = team1RoleText === 'Forward' ? Role.Forward : Role.Goalie;
          const team1Awakenings: string[] = [];
          cols.eq(1).find('img').each((_idx: number, img: Element) => {
            team1Awakenings.push($(img).attr('title') || $(img).attr('alt') || '');
          });
          const team1Stats = cols.eq(2).text().trim().split('/');
          const team1UserLink = cols.eq(0).find('a').attr('href') || '';
          const team1UserId = team1UserLink.split('/').pop() || '';

          // Team 2 player (badges: Role, Level - reversed!)
          const team2Char = cols.eq(5).find('img').attr('alt') || 'Unknown';
          const team2Badges = cols.eq(5).find('.badge');
          const team2RoleText = team2Badges.eq(0).text().trim();
          const team2LevelText = team2Badges.eq(1).text().trim();
          const team2Level = parseInt(team2LevelText, 10) || 1;
          const team2Role = team2RoleText === 'Forward' ? Role.Forward : Role.Goalie;
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
            goals: parseInt(team1Stats[0], 10),
            assists: parseInt(team1Stats[1], 10),
            scores: parseInt(team1Stats[2], 10),
            knockouts: parseInt(team1Stats[3], 10),
          });

          playerItems.push({
            userId: team2UserId,
            team: 2,
            character: team2Char,
            role: team2Role,
            awakenings: team2Awakenings,
            level: team2Level,
            goals: parseInt(team2Stats[0], 10),
            assists: parseInt(team2Stats[1], 10),
            scores: parseInt(team2Stats[2], 10),
            knockouts: parseInt(team2Stats[3], 10),
          });
        });

        // Create unique match ID based on data to avoid duplicates
        const matchUniqueKey = `${player.id}-${playedAt.getTime()}-${character.toLowerCase()}-${matchResult.toLowerCase()}`;

        // Save to database (upsert to skip duplicates)
        const matchPromise = fastify.prisma.matchHistory.upsert({
          where: { id: matchUniqueKey },
          update: {},
          create: {
            id: matchUniqueKey,
            map: mapName,
            role,
            mode,
            result: matchResult,
            duration,
            bans,
            avgRank: avgTier,
            playerId: player.id,
            playedAt,
            playerStats: {
              create: playerItems
            }
          },
          include: {
            playerStats: true
          }
        });

        matchPromises.push(matchPromise);
      });

      // Wait for all matches to be saved
      await Promise.all(matchPromises);

      // Fetch and return the match history from database
      const savedMatches = await fastify.prisma.matchHistory.findMany({
        where: { playerId: player.id },
        include: { playerStats: true },
        orderBy: { playedAt: 'desc' }
      });

      return reply.status(200).send(savedMatches);

    } catch (error) {
      console.error('Error fetching match history:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};

export default matches;