import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';
import { OurRegions } from '../../types/players';

interface LBProps {
  page: number;
  sort: 'rank' | 'rating' | 'wins' | 'losses' | 'winrate';
  rank?: string;
  character?: string;
  role?: 'Forward' | 'Goalie'
  direction?: 'asc' | 'desc';
  region: OurRegions;
}

const leaderboard: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {
    let { page, sort, rank, character, role, region, direction } = req.query as LBProps;

    const perPage = 100;
    page = Number(page) || 1;
    region = region || 'Global';

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
      ...(rank && { rankName: rank }),
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

    const totalPages = Math.ceil(totalItems / perPage);

    return reply.status(200).send({
      page,
      perPage,
      totalItems,
      totalPages,
      sortKey,
      sortDirection,
      region,
      rank,
      data,
    });
  });
};

export default leaderboard;
