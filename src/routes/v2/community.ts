import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';

const community: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {
    let { region, tags, search } = req.query as { region?: string, tags?: string, search?: string };

    const tagArray = tags?.split(',').map(t => t.trim()).filter(Boolean) || [];

    try {
      const communities = await prisma.communities.findMany({
        where: {
          ...(region && { region: { equals: region, mode: 'insensitive' } }),
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }),
          ...(tagArray.length > 0 && {
            tags: {
              hasSome: tagArray,
            },
          }),
        },
      });
  
      return reply.status(200).send(communities);
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: 'Something went wrong' });
    }
  });
};

export default community;
