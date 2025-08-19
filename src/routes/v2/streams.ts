import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';
import { twitchClient } from '../../core/cronjobs/twitch';

const streams: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {

    const twitchStreams = await prisma.twitchStreams.findMany();
    const youtubeStreams = await prisma.youTubeStreams.findMany();
    
    return reply.status(200).send({ twitch: twitchStreams, youtube: youtubeStreams })
  });

  // Developed for Haki's Event
  // Fetches live info + VODs for a specific user
  fastify.get('/twitch/:username', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { username } = req.params as { username: string };
    const login = await twitchClient('/users', 'GET', { login: username });
    
    const videos = await twitchClient('/videos', 'GET', {
      user_id: login.data[0].id,
      type: 'archive',
      sort: 'time',
      first: 10
    });
    
    return reply.status(200).send({ user: login, videos })
  });
};

export default streams;