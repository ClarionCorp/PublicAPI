// An alternative use for fetching "authenticated" cached data :)

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';
import { getTypeOfInput } from '../../core/utils';

const cached: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {
    return reply.status(200).send({ message: "hello!" });
  });

  fastify.get('/players/:input', async (req, reply) => {
    const { input } = req.params as { input: string };
    const inType = getTypeOfInput(input);

    try {
      const user = await prisma.player.findUnique({
        where: {
          ...(inType === 'id' && { id: input }),
          ...(inType === 'username' && { username: input }),
        },
        include: {
          ratings: { orderBy: { createdAt: 'desc' }},
          characterRatings: true,
          teams: true
        }
      });

      if (!user) {
        return reply.status(404).send({ message: `A Player with that ${inType} could not be found.` });
      }
  
      return reply.status(200).send({
        data: user,
        assets: {
          nameplate: `${process.env.CDN_BASE_URL}/nameplate/${user.nameplateId}.webp`
        },
        status: 200,
        ok: true
      });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ message: "Something went wrong" });
    }
  });
};

export default cached;