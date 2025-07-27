import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';

const streams: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {

    const twitchStreams = await prisma.twitchStreams.findMany();
    const youtubeStreams = await prisma.youTubeStreams.findMany();
    
    return reply.status(200).send({ twitch: twitchStreams, youtube: youtubeStreams })
  });
};

export default streams;
