import { FastifyPluginAsync } from 'fastify';
import hello from './hello';
import players from './players';
import leaderboard from './leaderboard';

const v2Routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(hello, { prefix: '/hello' });
  fastify.register(players, { prefix: '/players' });
  fastify.register(leaderboard, { prefix: '/leaderboard' });
};

export default v2Routes;