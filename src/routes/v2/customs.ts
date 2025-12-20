// Assorted stuff that people can use :)

import { FastifyPluginAsync } from 'fastify';

const customs: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {
    
  });
};

export default customs;
