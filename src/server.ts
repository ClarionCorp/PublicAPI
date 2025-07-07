import Fastify from 'fastify';
import routeLogger from './plugins/logger';
import prismaPlugin from './plugins/prisma';
import cronPlugin from './plugins/cron';
import prometheusPlugin from './plugins/odyssey';
import teamsPlugin from './plugins/teams';
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
    await fastify.register(routeLogger);
    await fastify.register(cronPlugin);
    await fastify.register(prismaPlugin);
    await fastify.register(prometheusPlugin);
    await fastify.register(teamsPlugin);

    await fastify.register(v1Routes, { prefix: '/v1' });

    // Health check route
    fastify.get('/health', async () => ({ ok: true }));
    
    const PORT = Number(process.env.SERVER_PORT || 12200);

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Server Started Completed.`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();