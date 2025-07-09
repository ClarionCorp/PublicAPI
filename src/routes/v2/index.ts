import { FastifyPluginAsync } from 'fastify';
import hello from './hello';
import players from './players';
import leaderboard from './leaderboard';
import adminCommunity from './admin/community';
import { appLogger } from '../../plugins/logger';

const logger = appLogger('Routes');

const v2Routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(hello, { prefix: '/hello' });
  fastify.register(players, { prefix: '/players' });
  fastify.register(leaderboard, { prefix: '/leaderboard' });
  fastify.register(adminCommunity, { prefix: '/admin' });

  logger.info('[+] Routes v2 Initialized!');
};

export default v2Routes;