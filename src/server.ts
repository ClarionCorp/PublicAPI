import Fastify from 'fastify';
import routeLogger from './plugins/logger';
import prismaPlugin from './plugins/prisma';
import cronPlugin from './plugins/cron';
import prometheusPlugin from './plugins/odyssey';
import teamsPlugin from './plugins/teams';
import v2Routes from './routes/v2';
import chalk from 'chalk';
import { sleep } from './core/utils';
import { updateLeaderboard } from './core/cronjobs/leaderboard';

const fastify = Fastify({
  logger: {
    level: 'error',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
    hooks: {
      logMethod (args, method) {
        // Suppress 'Server listening at...' messages
        if (args[0]?.includes?.('Server listening at')) return
        method.apply(this, args)
      }
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

    await fastify.register(v2Routes, { prefix: '/v2' });

    // Health check route
    fastify.get('/health', async () => ({ ok: true }));
    
    const PORT = Number(process.env.SERVER_PORT || 12200);

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log('');
    console.log(chalk.greenBright(`[>] Server Startup Completed.`));
    console.log('');

    sleep(2000);
    await updateLeaderboard();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();