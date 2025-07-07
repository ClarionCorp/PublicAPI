import { FastifyPluginAsync } from 'fastify';
import hello from './hello';
import players from './players';

const v1Routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(hello, { prefix: '/hello' });
  fastify.register(players, { prefix: '/players' });
};

export default v1Routes;