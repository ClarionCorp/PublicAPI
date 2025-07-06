import { FastifyPluginAsync } from 'fastify';
import hello from './hello';

const v1Routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(hello, { prefix: '/hello' });
};

export default v1Routes;