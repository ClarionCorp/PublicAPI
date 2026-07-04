// Assorted stuff that people can use :)

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';
import { fetchOdyPlayer } from '../../core/players/odysseyPlayers';
import { PlayerStatus } from '../../../prisma/client';
import { PlayerObjectType } from '../../types/players';

const tools: FastifyPluginAsync = async (fastify) => {
  fastify.get('/awakenings', async (req, reply) => {
    let { active } = req.query as { active?: string };

    try {
      const awakenings = await prisma.awakenings.findMany({
        where: {
          ...(active === 'true' ? { active: true } : {})
        },
        omit: {
          description: true,
          rotatedIn: true
        },
        orderBy: { name: 'asc' }
      });

      return reply.status(200).send(awakenings);

    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });

  fastify.get('/characters', async (req, reply) => {
    try {
      const characters = await prisma.strikers.findMany();

      return reply.status(200).send(characters);

    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });

  fastify.get('/metadata/:username', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { username } = req.params as { username: string };
    try {
      const usernameVerify = await fetchOdyPlayer(username);

      if (!usernameVerify) {
        return reply.status(404).send({ error: 'Player not found' });
      }

      return reply.status(200).send({ username: usernameVerify.username });

    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });

  fastify.get('/discord/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!id) { return reply.status(400).send({ error: "Missing id field" }); }
    try {
      const linkedUsers = await prisma.player.findMany({
        where: { discordId: id },
        select: {
          id: true,
          username: true,
          emoticonId: true,
          nameplateId: true,
          titleId: true,
          title: true,
          tags: true,
          socialUrl: true
        }
      });

      return reply.status(200).send({ linkedUsers });

    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });

  fastify.get('/maps', async (req, reply) => {
    try {
      const allMaps = await prisma.maps.findMany( { omit: { updatedAt: true } } );
      const inRotation = await prisma.maps.findMany({ where: { active: true }, omit: { updatedAt: true } });

      return reply.status(200).send({ active: inRotation, all: allMaps });

    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });

  fastify.get('/online', async (req, reply) => {
    try {
      const counts = await prisma.onlinePlayers.groupBy({
        by: ['status'],
        _count: true,
      });

      const byStatus = Object.fromEntries(
        counts.map((g) => [g.status, g._count])
      ) as Partial<Record<PlayerStatus, number>>;

      return reply.status(200).send({
        online: byStatus.ONLINE ?? 0,
        queued: byStatus.INQUEUE ?? 0,
        playing: byStatus.INGAME ?? 0
      });

    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });

  // Guesses whether or not a player is smurfing. Ranked-Only currently.
  fastify.get('/smurf/:username', { preHandler: [fastify.authenticate] },  async (req, reply) => {
    const { username } = req.params as { username: string };
    if (!username) { return reply.status(400).send({ error: "Missing username field" }); }
    try {
      const internal_res = await fastify.inject({
        method: 'GET',
        url: `/v2/players/${username}`,
        headers: { "authorization": req.headers.authorization }
      });
      const player: PlayerObjectType = await internal_res.json();
      if (internal_res.statusCode !== 200 && internal_res.statusCode !== 201) { throw new Error(`Internal fetch returned no such player with username ${username}!`) };

      let youngAccount = false;
      let lowLevel = false;
      let abnormalWinrate = false;

      // Account Age Check
      const oldestRating = player.ratings[player.ratings.length - 1];
      const oneMonthAgo = new Date(); oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      if (new Date(oldestRating.createdAt) > oneMonthAgo) { youngAccount = true };

      // Account Level Check
      if (player.mastery.currentLevel < 30) { lowLevel = true };

      // Abnormal Winrate Check (when paired with either above)
      const latestRating = player.ratings[0];
      if (latestRating.games > 0 && (latestRating.wins / latestRating.games) > 0.85) { abnormalWinrate = true };

      let confidence: 'none' | 'low' | 'medium' | 'high' = 'none';

      if (abnormalWinrate && youngAccount && lowLevel) {
        confidence = 'high';
      } else if (abnormalWinrate && (youngAccount || lowLevel)) {
        confidence = 'medium';
      } else if (youngAccount || lowLevel) {
        confidence = 'low';
      }

      return reply.status(200).send({
        username: player.username,
        confidence,
        signals: { youngAccount, lowLevel, abnormalWinrate }
      });

    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });
};

export default tools;
