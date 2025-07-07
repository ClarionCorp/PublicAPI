import { FastifyPluginAsync } from 'fastify';

const hello: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {

    const userQuery = await fastify.prometheus.player.usernameQuery('blals');
    return reply.status(200).send(userQuery);
  });
};

export default hello;
