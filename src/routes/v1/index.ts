import { FastifyPluginAsync } from 'fastify';
import { appLogger } from '../../plugins/logger';
import players from './players';

const logger = appLogger('Routes');

const v1Routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(players, { prefix: '/players' });

  logger.info('[+] Routes v1 Initialized!');
};

export default v1Routes;