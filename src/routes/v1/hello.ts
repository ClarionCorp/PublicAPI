import { FastifyPluginAsync } from 'fastify';

const hello: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {
    return reply.status(201).send('hello world!');
  });
};

export default hello;
