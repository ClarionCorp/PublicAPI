import fp from 'fastify-plugin';
import cron from 'node-cron';
import { FastifyPluginAsync } from 'fastify';
import steamRefresh from '../core/steam';

const cronPlugin: FastifyPluginAsync = async (fastify) => {
  
  // Every 10 days at 4:00 am, refresh Steam Token
  cron.schedule('0 4 */10 * *', async () => {
    await steamRefresh();
  });

  fastify.log.info('[+] Cronjobs Initialized!');
};

export default fp(cronPlugin);