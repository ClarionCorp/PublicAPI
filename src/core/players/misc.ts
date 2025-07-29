import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';
import { PROMETHEUS } from '../../types/prometheus';
import { PlayerObjectType } from '../../types/players';
import { Team } from '../../types/teams';

const miscLogger = appLogger('Players/Misc')

export interface UpdateRequirements {
  cachedPlayer: any,
  playerMastery: PROMETHEUS.API.MASTERY.Player,
  ensuredRegion: {
    player: PROMETHEUS.RAW.Player & {
      rank: number;
      wins: number;
      losses: number;
      games: number;
      topRole: PROMETHEUS.RAW.Role;
      rating: number;
      mostPlayedCharacters: {
        characterId: string;
        gamesPlayed: number;
      };
      currentDivistionId: string;
      progressToNext: number;
    },
    region: string
  }
  isGhostProfile: boolean,
}

// Appends Team data to return data if any is found.
export async function appendTeams() {

}

// Returns data we have on specified player/id.
// If it returns null, that player could not be found.
export async function fetchCachedPlayer(username?: string, userId?: string): Promise<PlayerObjectType | null> {
  try {
    if (!username && !userId) {
      throw new Error('No search parameters received!');
    }

    const cachedPlayer = await prisma.player.findFirst({
      where: username ? { username: { equals: username, mode: 'insensitive' } } : { id: userId },
      include: {
        characterRatings: {
          take: 300,
          orderBy: {
            createdAt: 'desc',
          },
        },
        ratings: {
          take: 1000, // Defaults to 1000 if not set.
          orderBy: {
            createdAt: 'desc',
          },
        },
        teams: {
          select: {
            team: {
              select: {
                teamName: true,
                teamTag: true,
                logo: true,
                series: true,
                season: true
              }
            }
          }
        }
      },
    })

    const teams: Team[] = cachedPlayer?.teams.map(tp => ({
      teamName: tp.team.teamName,
      teamTag: tp.team.teamTag,
      series: tp.team.series,
      season: tp.team.season,
      logo: tp.team.logo,
    }));

    return {
      ...cachedPlayer,
      teams
    };

  } catch (e) {
    miscLogger.error(`Error while fetching CACHED PLAYER: `, e);
    return null;
  }
}

// Whether or not we should query the rest of the endpoints
// to update our data. (Or just return partially cached)
export function shouldUpdateUser(data: UpdateRequirements): boolean {
  const cachedPlayer = data.cachedPlayer;
  const playerMastery = data.playerMastery;

  // If ALL are true, ignore updates.
  // If ANY are false, force full updates.
  // Could probably localize this in the future for speed.

  // console.log(`2: ${playerMastery.currentLevelXp === cachedPlayer.currentXp}`);
  // console.log(`3: ${playerMastery.currentLevel === cachedPlayer.ratings[0]?.masteryLevel}`);
  // console.log(`4: ${data.ensuredRegion?.player.rating === cachedPlayer.ratings[0]?.rating}`);
  // console.log(`5: ${data.isGhostProfile === false}`);
  // console.log(`Override: ${cachedPlayer.characterRatings.length == 0 && cachedPlayer.ratings.length > 0}`);

  let ignoreUpdates =
    cachedPlayer &&
    playerMastery.currentLevelXp === cachedPlayer.currentXp &&
    playerMastery.currentLevel === cachedPlayer.ratings[0]?.masteryLevel &&
    data.ensuredRegion?.player.rating === cachedPlayer.ratings[0]?.rating &&
    (data.isGhostProfile === false) // AKA, the user is not a ghost profile, so don't worry about it
  ;

  // Override if player has no character ratings, but has normal ratings. (Season Reset)
  // This needs to be separated so it's an override, rather than a normal check.
  if (cachedPlayer.characterRatings.length == 0 && cachedPlayer.ratings.length > 0)
    ignoreUpdates = false;

  miscLogger.debug(`Ignore updates? ${ignoreUpdates} (${cachedPlayer.username})`)
  return ignoreUpdates;
}