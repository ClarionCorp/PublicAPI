import fp from 'fastify-plugin';
import cron from 'node-cron';
import { FastifyPluginAsync } from 'fastify';
import steamRefresh from '../core/cronjobs/steam';
import { updateTwitch } from '../core/cronjobs/twitch';

const cronPlugin: FastifyPluginAsync = async (fastify) => {
  
  // [SteamToken] Every 10 days at 4:00 am
  cron.schedule('0 4 */10 * *', async () => {
    await steamRefresh();
  });

  // [TwitchStreams] Every minute
  cron.schedule('*/1 * * * *', async () => {
    await updateTwitch();
  })

  fastify.log.info('[+] Cronjobs Initialized!');
};

export default fp(cronPlugin);