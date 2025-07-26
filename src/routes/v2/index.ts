import { FastifyPluginAsync } from 'fastify';
import { appLogger } from '../../plugins/logger';
import hello from './hello';
import players from './players';
import leaderboard from './leaderboard';
import adminCommunity from './admin/community';
import overlay from './overlay';
import tracking from './tracking';
import history from './history';
import community from './community';
import utilities from './utilities';

const logger = appLogger('Routes');

const v2Routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(hello, { prefix: '/hello' });
  fastify.register(players, { prefix: '/players' });
  fastify.register(leaderboard, { prefix: '/leaderboard' });
  fastify.register(overlay, { prefix: '/overlay' });
  fastify.register(tracking, { prefix: '/tracking' });
  fastify.register(adminCommunity, { prefix: '/admin' });
  fastify.register(history, { prefix: '/history' });
  fastify.register(community, { prefix: '/communities' });
  fastify.register(utilities, { prefix: '/utility' });

  logger.info('[+] Routes v2 Initialized!');
};

export default v2Routes;