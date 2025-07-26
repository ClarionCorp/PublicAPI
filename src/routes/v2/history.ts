import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';
import { OurRegions } from '../../types/players';
import { timeAgo } from '../../core/utils';
import { sendToAnalytics } from '../../core/analytics';
import { getRankGroup, Rank } from '../../core/ranks';

interface CharProps {
  sort: 'character' | 'games' | 'wins' | 'losses' | 'winrate';
  character?: string;
  role?: 'Forward' | 'Goalie'
  direction?: 'asc' | 'desc';
  region: OurRegions | 'All';
  gamemode?: 'Normal' | 'Ranked' | 'NormalInitial' | 'RankedInitial';
  rank?: string | string[]
  date?: string
}

const history: FastifyPluginAsync = async (fastify) => {
  fastify.get('/characters', async (req, reply) => {
    let { sort, role, region, gamemode, direction, character, rank, date } = req.query as CharProps;

    region = region || 'Global';
    gamemode = gamemode || 'Ranked';
    let rankList: string[] = [];
    const mode = gamemode;

    const validSortings = ['character', 'games', 'wins', 'losses', 'winrate'] as const;
    const sortKey = validSortings.includes(sort) ? sort : 'winrate';

    const defaultDirections: Record<typeof sortKey, 'asc' | 'desc'> = {
      character: 'asc',
      games: 'desc',
      wins: 'desc',
      losses: 'desc',
      winrate: 'desc',
    };

    if (gamemode === 'Normal') gamemode = 'NormalInitial';
    else if (gamemode === 'Ranked') gamemode = 'RankedInitial';

    const sortDirection =
      direction === 'asc' || direction === 'desc'
        ? direction
        : defaultDirections[sortKey];

    const where: any = {
      ...(region !== 'All' && { region }),
      ...(character && { character }),
      ...(role && { role }),
      ...(gamemode && { gamemode }),
      ...(rank && { rankGroup: rank }),
    };

    if (rank) {
      if (Array.isArray(rank)) {
        rankList = rank.map(r => getRankGroup(r));
      } else {
        rankList = [getRankGroup(rank)];
      }
    
      where.rankGroup = { in: rankList };
    }

    if (date) {
      const parts = date.split('-'); // YYYY-MM-DD
      const [year, month, day] = parts.map(Number);
    
      if (!year || !month || !day) {
        return reply.code(400).send({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      }
    
      const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      const startOfNextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
    
      where.createdAt = {
        gte: startOfDay,
        lt: startOfNextDay,
      };
    } else {
      // If no date is provided, return list of available dates instead
      const allDates = await prisma.charBoardHistory.findMany({
        where,
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
    
      const uniqueDays = Array.from(
        new Set(
          allDates.map(entry => new Date(entry.createdAt).toISOString().slice(0, 10)) // YYYY-MM-DD
        )
      );
    
      return reply.send({
        message: "Please add parameter 'date' with one of these available dates:",
        availableDates: uniqueDays,
      });
    }

    // Don't orderBy if sorting by winrate
    const data = await prisma.charBoardHistory.findMany({
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
      return { ...rest, wins, losses, winrate, from: createdAt };
    });

    if (sortKey === 'winrate') {
      processed = processed.sort((a, b) => {
        const diff = a.winrate - b.winrate;
        return sortDirection === 'asc' ? diff : -diff;
      });
    }

    await sendToAnalytics('V2_HISTORY_CHARACTERS', req.ip);

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

  fastify.get('/names/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const names = await prisma.nameHistory.findMany({
      where: { userId: id },
      orderBy: { changedAt: 'desc' },
    });

    if (names.length > 0) {
      await sendToAnalytics('V2_HISTORY_PLAYERS', req.ip);
      return reply.status(200).send({ message: "If you own this account, and you want any of these removed, contact 'dsit' on Discord.", nameHistory: names });
    }
    else { return reply.status(404).send({ error: `No names could be found for ID: ${id}` }) };
  });
};

export default history;