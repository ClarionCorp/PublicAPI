// Assorted stuff that people can use :)

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';
import { fetchOdyPlayer } from '../../core/players/odysseyPlayers';

const tools: FastifyPluginAsync = async (fastify) => {
  fastify.get('/awakenings', async (req, reply) => {
    let { active } = req.query as { active?: string };

    try {
      const awakenings = await prisma.awakenings.findMany({
        where: {
          ...(active === 'true' ? { active: true } : {})
        }
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
};

export default tools;
