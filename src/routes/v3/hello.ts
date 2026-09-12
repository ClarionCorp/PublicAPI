// The default template of sorts lol

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';
import { fetchUsernameQuery } from '../../core/prometheus';

const hello: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {

    const userQuery = await fetchUsernameQuery('blals');
    return reply.status(200).send(userQuery);
  });
};

export default hello;
