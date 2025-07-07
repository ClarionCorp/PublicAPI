import fp from 'fastify-plugin';
import cron from 'node-cron';
import { FastifyPluginAsync } from 'fastify';
import steamRefresh from '../core/cronjobs/steam';
import { updateTwitch } from '../core/cronjobs/twitch';
import { updateYouTube } from '../core/cronjobs/youtube';
import { appLogger } from './logger';

const logger = appLogger('Cron');

const cronPlugin: FastifyPluginAsync = async (fastify) => {
  
  // [SteamToken] Every 10 days at 4:00 am
  cron.schedule('0 4 */10 * *', async () => {
    await steamRefresh();
  });


  // Only enables the rest in production.
  if (process.env.MODE === 'PRODUCTION') {

    // [TwitchStreams] Every minute
    cron.schedule('*/1 * * * *', async () => {
      await updateTwitch();
    })

    // [YouTubeStreams] Every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      await updateYouTube();
    })

  }

  logger.info('[+] Cronjobs Initialized!');
};

export default fp(cronPlugin);