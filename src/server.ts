import Fastify from 'fastify';
import requestLogger from '@plugins/logger';
import prismaPlugin from '@plugins/prisma';
import v1Routes from './routes/v1';

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  },
  disableRequestLogging: true,
});

const start = async () => {
  console.clear();
  try {
    await fastify.register(requestLogger);
    await fastify.register(prismaPlugin);

    await fastify.register(v1Routes, { prefix: '/v1' });

    // Health check route
    fastify.get('/health', async () => ({ ok: true }));
    
    const PORT = Number(process.env.SERVER_PORT || 12200);

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Server listening at http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();