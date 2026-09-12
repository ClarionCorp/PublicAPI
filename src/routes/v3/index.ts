import { FastifyPluginAsync } from 'fastify';
import { appLogger } from '../../plugins/logger';
import players from './players';

const logger = appLogger('Routes');

const v3Routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(players, { prefix: '/players' });

  logger.info('[+] Routes v3 Initialized!');
};

export default v3Routes;