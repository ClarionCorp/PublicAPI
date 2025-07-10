// The default template of sorts lol

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';

const hello: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {

    const userQuery = await prometheusService.player.usernameQuery('blals');
    return reply.status(200).send(userQuery);
  });
};

export default hello;
