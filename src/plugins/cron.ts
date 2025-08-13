import fp from 'fastify-plugin';
import cron from 'node-cron';
import { FastifyPluginAsync } from 'fastify';
import steamRefresh from '../core/cronjobs/steam';
import { updateTwitch } from '../core/cronjobs/twitch';
import { updateYouTube } from '../core/cronjobs/youtube';
import { appLogger } from './logger';
import { checkTrackingUpdates } from '../core/cronjobs/tracking';
import { updateLeaderboard } from '@/core/cronjobs/leaderboard';
import { updateCharacterBoard } from '@/core/cronjobs/charboard';
import { updateTeams } from '@/core/cronjobs/teams';

const logger = appLogger('Cron');

const cronPlugin: FastifyPluginAsync = async (fastify) => {
  
  // [SteamToken] Every 10 days at 4:00 am
  cron.schedule('0 4 */10 * *', async () => {
    await steamRefresh();
  });

  // [LiveTracking] Every minute
  cron.schedule('* * * * *', async () => {
    await checkTrackingUpdates();
  });

  // [Teams] Every day at 11 pm. (offset)
  cron.schedule('0 23 * * *', async () => {
    await updateTeams();
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

    // [Leaderboard] Every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      await updateLeaderboard();
    })

    // [CharacterBoard] Every Sunday at 2:00 am (offset from LB)
    cron.schedule('0 2 * * 0', async () => {
      await updateCharacterBoard();
    })

  }

  logger.info('[+] Cronjobs Initialized!');
};

export default fp(cronPlugin);