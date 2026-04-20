import { getTypeOfInput } from '../../core/utils';
import { appLogger } from '../../plugins/logger';
import { FastifyPluginAsync } from 'fastify';
import { searchByID } from '../../core/players/idSearch';
import { usernameSearch } from '../../core/players/userSearch';
import { regions } from '../../types/players';
import { calculatePlaystyle } from '../../core/players/misc';
import { prisma } from '../../plugins/prisma';
import { fetchCharacterMastery, fetchPlayerMastery } from '../../core/prometheus';

const ensureLogger = appLogger('PlayerRoute/v2')

// Users must have a valid JWT to use this endpoint.
// I hate doing this but we cannot gamble someone abusing it.
// (If we get rate limited it could shutdown CC)
const players: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:input', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { input } = req.params as { input: string };
    let { region, cached } = req.query as { region?: string; cached?: boolean };
    const inType = getTypeOfInput(input);

    if (region && (!regions.includes(region))) { region = 'Global' };

    try {
      if (inType == 'id') {
        ensureLogger.info(`User is searching with ID, passing off to ID-Search...`);
        const response = await searchByID(input, req, region, cached);
        return reply.status(response.status).send(response.ok ? response.data : { error: response.message });
      } else {
        const response = await usernameSearch(input, req, region, cached);
  
        return reply.status(response.status).send(response.ok ? response.data : { error: response.message });
      }
    } catch (error) {
      // ensureLogger.error(`Error while FETCHING PLAYER: `, error);
      return reply.status(500).send({ error });
    }
  });

  // Pretty primitive, but gets the job done for now.
  // I don't want to include it in the one above by default cos it adds an extra 300ms on ALL searches.
  fastify.get('/:id/mastery/characters', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const charMastery = await fetchCharacterMastery(id);

    if (!charMastery) { return reply.status(404).send({ error: "The specified player could not be found" }) };

    return reply.status(200).send(charMastery);
  });

  // Comments apply to this one too.
  fastify.get('/:id/mastery', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const playerMastery = await fetchPlayerMastery(id);

    if (!playerMastery) { return reply.status(404).send({ error: "The specified player could not be found" }) };

    return reply.status(200).send(playerMastery);
  });

  fastify.get('/:input/playstyle', async (req, reply) => {
    const { input } = req.params as { input: string };
    const inType = getTypeOfInput(input);
    let id = input;
    let { character } = req.query as { character?: string; };

    if (inType == 'username') {
      const user = await prisma.player.findFirst({ where: { username: input }});
      id = user.id;
    }

    try {
      const characterMastery = await prisma.playerCharacterRating.findMany({
        where: {
          playerId: id,
          ...(character && { character })
        }
      });
      const lastRating = await prisma.playerRating.findFirst({ where: { playerId: id }, orderBy: { createdAt: 'desc' } });
      if (!characterMastery || !lastRating) { return reply.status(404).send({ error: "The specified player could not be found" }) };
  
      const playstyle = calculatePlaystyle(characterMastery, lastRating.rating)
  
      return reply.status(200).send(playstyle);
    } catch (e) {
      ensureLogger.error(`Error while fetching Player Playstyle!`, e);
      if (character) { return reply.status(500).send({ error: "Something went wrong. Please make sure you are using character IDs, prefixed with 'CD_'!" }); }
      return reply.status(500).send({ error: "Something went wrong, check console for details." });
    }
  });

  // POST that acts like GET but we just use the body instead, yk?
  fastify.post('/:input/presence', async (req, reply) => {
    const { input } = req.params as { input: string };
    const inType = getTypeOfInput(input);
    let id = input;

    const body = req.body as { characterId: string, role: 'Forward' | 'Goalie' };
    const { characterId, role } = body;
    if (!characterId || !role) { return reply.status(400).send({ error: 'Missing fields' }) };

    if (inType == 'username') {
      const user = await prisma.player.findFirst({ where: { username: input }});
      id = user.id;
    }

    try {
      const [top3, playerEntry] = await Promise.all([
        prisma.roleBoard.findMany({
          where: { characterId, role },
          orderBy: { playerScore: 'desc' },
          take: 3,
          include: { player: true },
        }),
        prisma.roleBoard.findUnique({
          where: { playerId_characterId_role: { playerId: id, characterId, role } },
          include: { player: true },
        }),
      ])

      // Count how many players score higher to get their rank
      const playerRank = playerEntry
        ? (await prisma.roleBoard.count({
            where: {
              characterId,
              role,
              playerScore: { gt: playerEntry.playerScore },
            },
          })) + 1
        : null

      // Fetch neighbor entries
      const [above, below] = playerEntry
        ? await Promise.all([
            prisma.roleBoard.findFirst({
              where: {
                characterId,
                role,
                playerScore: { gt: playerEntry.playerScore },
              },
              orderBy: { playerScore: 'asc' },
              include: { player: true },
            }),
            prisma.roleBoard.findFirst({
              where: {
                characterId,
                role,
                playerScore: { lt: playerEntry.playerScore },
              },
              orderBy: { playerScore: 'desc' },
              include: { player: true },
            }),
          ])
        : [null, null]

      
      // Calc Presence Significance
      const koPG = playerEntry.knockouts / playerEntry.games
      const scorePG = playerEntry.scores / playerEntry.games
      const assistPG = playerEntry.assists / playerEntry.games
      const savePG = playerEntry.saves / playerEntry.games
      const mvpRate = playerEntry.mvps / playerEntry.games

      const clamp = (v: number) => Math.min(1, Math.max(0, v))

      let statScore: number

      if (role === 'Forward') {
        statScore =
          clamp(scorePG  / 11)  * 0.30 +
          clamp(koPG     / 10)  * 0.35 +
          clamp(assistPG / 11)  * 0.15 +
          clamp(mvpRate)        * 0.10 +
          clamp(savePG   / 200) * 0.10
      } else {
        statScore =
          clamp(savePG   / 250) * 0.30 +
          clamp(koPG     /   4) * 0.30 +
          clamp(scorePG  /   3) * 0.20 +
          clamp(assistPG /   6) * 0.10 +
          clamp(mvpRate)        * 0.10
      }

      // Reuse the playerRank count you're already computing for above/below
      const [totalInRole, rankInRole] = await Promise.all([
        prisma.roleBoard.count({ where: { characterId, role } }),
        prisma.roleBoard.count({
          where: { characterId, role, playerScore: { gt: playerEntry.playerScore } },
        }),
      ])

      const leaderboardPercentile = totalInRole > 1
        ? 1 - rankInRole / (totalInRole - 1)
        : 1

      const significance = (statScore * 0.95 + leaderboardPercentile * 0.05) * 100

      return reply.status(200).send({
        presence: {
          significance: parseFloat(significance.toFixed(2)),
          averages: {
            knockouts: parseFloat(koPG.toFixed(1)),
            scores: parseFloat(scorePG.toFixed(1)),
            assists: parseFloat(assistPG.toFixed(1)),
            saves: parseFloat(savePG.toFixed(1)),
            mvps: parseFloat(mvpRate.toFixed(1))
          }
        },
        roleBoard: {
          playerRank,
          top3,
          above,
          playerEntry,
          below
        }
      })
    } catch (e) {
      ensureLogger.error(`Error while fetching Player Role Leaderboard!`, e);
      return reply.status(500).send({ error: "Something went wrong, check console for details." });
    }
  });
};

export default players;