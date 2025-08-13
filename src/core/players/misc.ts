import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';
import { PROMETHEUS } from '../../types/prometheus';
import { PlayerCharacterRatingObjectType, PlayerObjectType, RolePlaystyle } from '../../types/players';
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
        },
        ratings: {
          take: 1000, // Defaults to 1000 if not set.
          orderBy: {
            createdAt: 'desc',
          },
        },
        characterRatings: {
          take: 300,
          orderBy: {
            createdAt: 'desc',
          },
        }
      },
    })

    if (!cachedPlayer) { return null }

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

type Playstyle = {
  forward: RolePlaystyle
  goalie: RolePlaystyle
}

export function calculatePlaystyle(characterRatings: PlayerCharacterRatingObjectType[], rating?: number): Playstyle {
  
  const sumStats = (entries: PlayerCharacterRatingObjectType[]) => {
    return entries.reduce(
      (acc, curr) => {
        acc.assists += curr.assists;
        acc.knockouts += curr.knockouts;
        acc.scores += curr.scores;
        acc.saves += curr.saves;
        acc.games += curr.games;
        return acc;
      },
      { assists: 0, knockouts: 0, scores: 0, saves: 0, games: 0 }
    );
  };

  const forwardEntries = characterRatings.filter(
    r => r.role === 'Forward' && r.games >= 3
  );
  const goalieEntries = characterRatings.filter(
    r => r.role === 'Goalie' && r.games >= 3
  );

  const forward = sumStats(forwardEntries);
  const goalie = sumStats(goalieEntries);

  // I got lazy and I'm bad at math.
  // Feel free to fix lol
  let ratingMult = 1;
  if (rating >= 3000) ratingMult = 0.8           // Pro League+
  else if (rating >= 2600) ratingMult = 0.9      // Chally and Omega
  else if (rating >= 2300) ratingMult = 1.0      // Diamond
  else if (rating >= 1700) ratingMult = 1.1      // Plat and Gold
  else if (rating < 1700) ratingMult = 1.2       // Silver and Below

  console.log(`Rating: ${rating}: Multiplier: ${ratingMult}`)

  const playstyle: Playstyle = {
    forward: {
      // ((Category Mult * (Category Weight * Rating Mult)) * Player Stat) / 10
      assists: { multiplier: Number((((1 * (0.65 * (ratingMult + 0.1))) * forward.assists) / 10).toFixed(3)), avgPerGame: Number((forward.assists / forward.games).toFixed(2)) },
      knockouts: { multiplier: Number((((1 * (0.80 * ratingMult)) * forward.knockouts) / 10).toFixed(3)), avgPerGame: Number((forward.knockouts / forward.games).toFixed(2)) },
      scores: { multiplier: Number((((1 * (0.75 * (ratingMult + 0.1))) * forward.scores) / 10).toFixed(3)), avgPerGame: Number((forward.scores / forward.games).toFixed(2)) },
      saves: { multiplier: Number((((1 * (0.125 * ratingMult)) * forward.saves) / 10).toFixed(3)), avgPerGame: Number((forward.saves / forward.games).toFixed(2)) },
    },
    goalie: {
      assists: { multiplier: Number((((1 * (0.80 * ratingMult)) * goalie.assists) / 10).toFixed(3)), avgPerGame: Number((goalie.assists / goalie.games).toFixed(2)) },
      knockouts: { multiplier: Number((((1 * (1.0 * (ratingMult - 0.1))) * goalie.knockouts) / 10).toFixed(3)), avgPerGame: Number((goalie.knockouts / goalie.games).toFixed(2)) },
      scores: { multiplier: Number((((1 * (1.0 * (ratingMult + 0.1))) * goalie.scores) / 10).toFixed(3)), avgPerGame: Number((goalie.scores / goalie.games).toFixed(2)) },
      saves: { multiplier: Number((((1 * (0.065 * (ratingMult - 0.1))) * goalie.saves) / 10).toFixed(3)), avgPerGame: Number((goalie.saves / goalie.games).toFixed(2)) },
    }
  }

  return playstyle;
}