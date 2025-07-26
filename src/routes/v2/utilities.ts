// Assorted stuff that people can use :)

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';

const utilities: FastifyPluginAsync = async (fastify) => {
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
};

export default utilities;