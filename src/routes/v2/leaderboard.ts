import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';
import { OurRegions } from '../../types/players';
import { timeAgo } from '../../core/utils';
import { sendToAnalytics } from '../../core/analytics';
import { getRankFromLP, getRankGroup, Rank } from '../../core/ranks';

interface PlayerProps {
  page: number;
  sort: 'rank' | 'rating' | 'wins' | 'losses' | 'winrate';
  rank?: string;
  character?: string;
  role?: 'Forward' | 'Goalie'
  direction?: 'asc' | 'desc';
  region: OurRegions;
}

interface CharProps {
  sort: 'character' | 'games' | 'wins' | 'losses' | 'winrate';
  character?: string;
  role?: 'Forward' | 'Goalie'
  direction?: 'asc' | 'desc';
  region: OurRegions | 'All';
  gamemode?: 'Normal' | 'Ranked' | 'NormalInitial' | 'RankedInitial';
  rank?: string;
  tumbleweeds?: string;
}

const rankOrder = [
  'Pro League',
  'Omega',
  'Challenger',
  'Diamond',
  'Platinum',
  'Gold',
  'Silver',
  'Bronze',
  'Rookie',
];

const leaderboard: FastifyPluginAsync = async (fastify) => {
  fastify.get('/players', async (req, reply) => {
    let { page, sort, rank, character, role, region, direction } = req.query as PlayerProps;

    const perPage = 100;
    page = Number(page) || 1;
    region = region || 'Global';
    let rankQuery;

    // Rank is queried
    if (rank) {
      if (/^\d+$/.test(rank)) { rankQuery = getRankFromLP(Number(rank)).rankObject.name }   // Rank is digits (rating)
      else { rankQuery = rank }                                                             // Rank is not digits (rank name)
    }
    

    const validSortings = ['rank', 'rating', 'wins', 'losses', 'winrate'] as const;
    const sortKey = validSortings.includes(sort) ? sort : 'rank';

    const defaultDirections: Record<typeof sortKey, 'asc' | 'desc'> = {
      rank: 'asc',
      rating: 'desc',
      wins: 'desc',
      losses: 'desc',
      winrate: 'desc',
    };

    const sortDirection =
      direction === 'asc' || direction === 'desc'
        ? direction
        : defaultDirections[sortKey];

    const where: any = {
      region,
      ...(character && { topCharacter: character }),
      ...(role && { topRole: role }),
      ...(rank && { rankName: rankQuery }),
    };

    const skip = (page - 1) * perPage;

    const [data, totalItems] = await Promise.all([
      prisma.leaderboard.findMany({
        where,
        orderBy: {
          [sortKey]: sortDirection,
        },
        skip,
        take: perPage,
      }),

      prisma.leaderboard.count({ where }),
    ]);

    const userIds = data.map(entry => entry.playerId);

    const matches = await prisma.esportsPlayers.findMany({
      where: {
        userId: { in: userIds }
      },
      select: {
        userId: true,
        linkedId: true,
        team: true,
      }
    });

    const totalPages = Math.ceil(totalItems / perPage);
    const lastUpdated = data[0]?.createdAt ? timeAgo(new Date(data[0].createdAt)) : null;
    const nextUpdate = new Date(data[0]?.createdAt.getTime() + 6 * 60 * 60 * 1000);
    const strippedData = data.map(({ createdAt, ...rest }) => {
      const matched = matches.filter(m => m.userId === rest.playerId);
      return {
        ...rest,
        teams: matched.map(m => m.team)
      };
    });


    await sendToAnalytics('V2_PLAYER_LEADERBOARD', req.ip, undefined, region);

    return reply.status(200).send({
      page,
      perPage,
      totalItems,
      totalPages,
      lastUpdated,
      nextUpdate,
      sortKey,
      sortDirection,
      region,
      rankFilter: rankQuery,
      data: strippedData,
    });
  });

  fastify.get('/characters', async (req, reply) => {
    let { sort, role, region, gamemode, direction, character, rank, tumbleweeds } = req.query as CharProps;

    region = region || 'Global';
    let rankList: string[] = [];
    const mode = gamemode;
    const showTumbleweeds = tumbleweeds === undefined ? false : tumbleweeds.toLowerCase() === 'true';

    const validSortings = ['character', 'games', 'wins', 'losses', 'winrate'] as const;
    const sortKey = validSortings.includes(sort) ? sort : 'winrate';

    const defaultDirections: Record<typeof sortKey, 'asc' | 'desc'> = {
      character: 'asc',
      games: 'desc',
      wins: 'desc',
      losses: 'desc',
      winrate: 'desc',
    };

    if (gamemode) {
      if (gamemode === 'Normal') gamemode = 'NormalInitial';
      else if (gamemode === 'Ranked') gamemode = 'RankedInitial';
    }

    const sortDirection =
      direction === 'asc' || direction === 'desc'
        ? direction
        : defaultDirections[sortKey];

    const where: any = {
      ...(region !== 'All' && { region }),
      ...(role && { role }),
      ...(gamemode && { gamemode }),
      ...(rank && { rankGroup: rank }),
      character: character
        ? { equals: character, not: 'None' }
        : { not: 'None' },
      ...(showTumbleweeds === false && {
        NOT: {
          OR: [
            { games: { lt: 10 } },
            { wins: { lt: 10 } },
            { losses: { lt: 10 } },
          ],
        },
      }),
    };

    if (rank) {
      const rankSplit = rank.split(',').map(r => r.trim());
      rankList = rankSplit.map(r => getRankGroup(r));
      where.rankGroup = { in: rankList };
    }

    // Don't orderBy if sorting by winrate
    const data = await prisma.characterLeaderboard.findMany({
      where,
      ...(sortKey !== 'winrate' && {
        orderBy: { [sortKey]: sortDirection },
      }),
    });

    const lastUpdated = data[0]?.createdAt ? timeAgo(new Date(data[0].createdAt)) : null;

    // Calculate and sort by winrate
    let processed = data.map(({ createdAt, wins, losses, ...rest }) => {
      const totalGames = wins + losses;
      const winrate = totalGames > 0 ? Math.round((wins / totalGames) * 1000) / 10 : 0;
      return { ...rest, wins, losses, winrate };
    });

    if (sortKey === 'winrate') {
      processed = processed.sort((a, b) => {
        const diff = a.winrate - b.winrate;
        return sortDirection === 'asc' ? diff : -diff;
      });
    }

    await sendToAnalytics('V2_CHARACTER_LEADERBOARD', req.ip);

    return reply.status(200).send({
      lastUpdated,
      sortKey,
      sortDirection,
      region,
      character,
      gamemode: mode,
      data: processed,
    });
  });

  // For World Comparison on CC Profiles
  fastify.get('/presence', async (req, reply) => {
    let { page, sort, rank, character, role, region, direction } = req.query as PlayerProps;
    
  });
};

export default leaderboard;
