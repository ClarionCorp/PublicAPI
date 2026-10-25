import { SeasonDates } from '../../../prisma/client';
import { appLogger } from '@/plugins/logger';
import { prisma } from '@/plugins/prisma';
import { fetchSeasonInfo } from '@/core/prometheus';

const logger = appLogger('Season');

export async function verifySeasonEnd() {
  try {
    const seasonInfo = await fetchSeasonInfo();

    const seasonNumber = parseInt(seasonInfo.season.name.replace(/\D/g, ""), 10); // would get "9" from "season9"

    const current = await prisma.seasonDates.upsert({
      where: { season: seasonNumber },
      update: { endDate: seasonInfo.season.endTime },
      create: {
        season: seasonNumber,
        endDate: seasonInfo.season.endTime,
        startDate: (await getLatestSeason()).endDate,
      }
    });

    logger.info(`Updated Successfully. Current Season: ${current.season}`)
  } catch (e) {
    logger.error(`Failed to fetch season end!`, e);
  }
}

export async function getLatestSeason(): Promise<SeasonDates> {
  return await prisma.seasonDates.findFirst({
    orderBy: { season: 'desc' }
  })
}