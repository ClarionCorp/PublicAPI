import { FastifyPluginAsync } from 'fastify';
import staticPlugin from '@fastify/static';
import path from 'path';

const registerStatic: FastifyPluginAsync = async (fastify) => {
  fastify.register(staticPlugin, {
    root: path.resolve(process.cwd(), 'assets/'),
    prefix: '/assets/',
    setHeaders: (res, filePath) => {
      // Cache for 3 hours
      res.setHeader('Cache-Control', 'public, max-age=10800, immutable');
    },
  });
};

export default registerStatic;