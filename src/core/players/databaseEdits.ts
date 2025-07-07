import { fetchCachedPlayer } from './misc';
import { Gamemode } from '../../../prisma/client';
import { PlayerObjectType } from '../../types/players';
import { PROMETHEUS } from '../../types/prometheus';
import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';

const dbLogger = appLogger('Players/Database')
const playerLogger = appLogger('PlayerLogger')
const discordLogger = appLogger('DiscordBind')

export interface NewPlayer {
  odysseyPlayer: PROMETHEUS.RAW.Player,
  ensuredRegion?: {
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
  } | null,
  playerStats: PROMETHEUS.API.STATS.Player
}

export interface PassiveUpdate {
  cachedPlayer: PlayerObjectType,
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
  },
  mastery: PROMETHEUS.API.MASTERY.Player
}


// Updates local player data with new ones,
// only if there any changes to begin with.
export async function checkUpdatePlayer(data: PassiveUpdate) {
  const cachedPlayer = data.cachedPlayer;
  const ensuredRegion = data.ensuredRegion;
  const mostRecentRating = cachedPlayer.ratings!.length > 0 ? cachedPlayer.ratings![0].rating : null;

  console.log(`MRR: ${mostRecentRating}`)

  // Check if Player's Rating changed, OR if their rank changed.
  if (ensuredRegion?.player.rating != mostRecentRating || ensuredRegion?.player.rank != cachedPlayer.ratings![0].rank) {
    // Update the most recent rating point with the new rank if rating stayed the same.
    if (cachedPlayer.ratings && ensuredRegion?.player.rating == mostRecentRating && ensuredRegion?.player.rank != cachedPlayer.ratings[0].rank) {
      await prisma.playerRating.update({
        where: {
          id: cachedPlayer.ratings[0].id,
        },
        data: {
          rank: ensuredRegion?.player.rank || 10001,
          masteryLevel: data.mastery.currentLevel || 0,
        },
      });
      playerLogger.info(`Rank has changed but rating is the same; updated rank for (${cachedPlayer.username})`);
      
    } else {
      // Create a new rating point if the rating has changed OR both rank AND rating have changed
      await prisma.playerRating.create({
      data: {
        player: {
        connect: {
          id: cachedPlayer.id,
        },
        },
        games: ensuredRegion?.player.games || 0,
        losses: ensuredRegion?.player.losses || 0,
        rank: ensuredRegion?.player.rank || 10001,
        rating: ensuredRegion?.player.rating || 0,
        wins: ensuredRegion?.player.wins || 0,
        masteryLevel: data.mastery.currentLevel || 0,
      },
      });
    
      if (ensuredRegion?.player.rating) {
      await prisma.ratingHistory.create({
        data: {
        playerId: cachedPlayer.id,
        username: ensuredRegion.player.username,
        rating: ensuredRegion?.player.rating,
        timestamp: new Date(),
        },
      });
      playerLogger.info(`Rating or Rank has changed, saving data for (${cachedPlayer.username})`);
      }
    }
  } else {
    // Regardless, update masteryLevel.
    await prisma.playerRating.update({
      where: {
        id: cachedPlayer.ratings![0].id,
      },
      data: {
        masteryLevel: data.mastery.currentLevel,
      },
    })
    playerLogger.warn(`Rating or Rank is unchanged; no new rating point created for player (${cachedPlayer.username})`);
  }
}

// Updates Character Datas
export async function updateCharacters() {

}

// Fixes ID Mismatches. Should really never happen.
// If it does though, try to fix it. Otherwise just report it.
export async function fixMismatch(cachedPlayer: PlayerObjectType, odysseyPlayer: PROMETHEUS.RAW.Player): Promise<PlayerObjectType | null> {
  try {
    await prisma.player.update({
      where: { username: odysseyPlayer.username },
      data: {
        id: odysseyPlayer.playerId
      }
    })
    dbLogger.info(`Fixed mismatch for (${odysseyPlayer.username})'s ID! (${odysseyPlayer.playerId})`);
    cachedPlayer.id = odysseyPlayer.playerId;
    return cachedPlayer;
  } catch { // Failed to save due to uniqueness
    dbLogger.error(' ')
    dbLogger.error('///////////')
    dbLogger.error(`Failed to fix USERID MISMATCH for Player '${odysseyPlayer.username}'.`)
    dbLogger.error(`Please investigate manually in Prisma Studio.`)
    dbLogger.error(' ')
    dbLogger.error(`Cached ID: ${cachedPlayer.id}`)
    dbLogger.error(`Odyssey ID: ${odysseyPlayer.playerId}`)
    dbLogger.error(`Username: ${odysseyPlayer.username}`)
    dbLogger.error('///////////')
    dbLogger.error(' ')
    return null;
  }
}

// Updates profiles in the event of a username change.
// Does not check on its own.
export async function usernameChanges(cachedPlayer: PlayerObjectType, odysseyPlayer: PROMETHEUS.RAW.Player): Promise<PlayerObjectType> {
  if (cachedPlayer.username.toLocaleLowerCase() != odysseyPlayer.username.toLocaleLowerCase()) {
    await updateNameHistory(cachedPlayer, odysseyPlayer); // Add to Name History first
    try {
      await prisma.player.update({
        where: { id: odysseyPlayer.playerId },
        data: { username: odysseyPlayer.username.toLocaleLowerCase() },
      });
    } catch (error) {
      dbLogger.error(`Failed Update Player's USERNAME CHANGE:`, error);
      return cachedPlayer;
    }

    const newPlayer = await fetchCachedPlayer(undefined, odysseyPlayer.playerId);
      
    return newPlayer!;
  }

  return cachedPlayer;
}

// Adds username to their name history.
// DOES NOT CHECK FOR NAME CHANGES ITSELF.
export async function updateNameHistory(cachedPlayer: PlayerObjectType, odysseyPlayer: PROMETHEUS.RAW.Player) {
  dbLogger.info(`Adding '${cachedPlayer.username}' to (${odysseyPlayer.username.toLocaleLowerCase()})'s Name History!`)
  try {
    const now = new Date();
    now.setSeconds(0, 0);
    const existingEntry = await prisma.nameHistory.findFirst({
      where: {
      userId: odysseyPlayer.playerId,
      changedAt: now,
      },
    });

    if (!existingEntry) {
      await prisma.nameHistory.create({
      data: {
        userId: odysseyPlayer.playerId,
        oldUsername: cachedPlayer.username.toLocaleLowerCase(),
        newUsername: odysseyPlayer.username.toLocaleLowerCase(),
        changedAt: now, // Set seconds to 0
      },
      });
    }
    } catch (error) {
    dbLogger.error(`Failed to add NAMEHISTORY entry:`, error);
    }
}

// Updates a user's rating, separate from updatePlayer()
// Additionally, adds data to the vault.
export async function updateRatingHistory() {

}

// Does not check for pre-existing players.
export async function createPlayer(data: NewPlayer): Promise<PlayerObjectType | null> {
  const odysseyPlayer = data.odysseyPlayer;

  dbLogger.info(`Creating New Player: '${odysseyPlayer.username}'.`)

  try {
    const createdPlayer = await prisma.player.create({
      data: {
        id: odysseyPlayer.playerId,
        username: decodeURI(odysseyPlayer.username.toLocaleLowerCase()),
        region: data.ensuredRegion?.region || 'Global',
        emoticonId: odysseyPlayer.emoticonId,
        logoId: odysseyPlayer.logoId,
        titleId: odysseyPlayer.titleId,
        nameplateId: odysseyPlayer.nameplateId,
        socialUrl: odysseyPlayer.socialUrl,
        discordId: odysseyPlayer.platformIds?.discord?.discordId,
        tags: odysseyPlayer.tags,
        playerStatus: odysseyPlayer.playerStatus,
        characterRatings: {
          createMany: {
            data: data.playerStats.characterStats
              .filter(cs => cs.ratingName !== 'None')   // keep only valid ratings
              .flatMap(cs => [
                {
                  character: cs.characterId,
                  wins: cs.roleStats.Forward.wins,
                  losses: cs.roleStats.Forward.losses,
                  knockouts: cs.roleStats.Forward.knockouts,
                  scores: cs.roleStats.Forward.scores,
                  mvp: cs.roleStats.Forward.mvp,
                  role: 'Forward',
                  saves: cs.roleStats.Forward.saves,
                  assists: cs.roleStats.Forward.assists,
                  games: cs.roleStats.Forward.games,
                  gamemode: cs.ratingName as Gamemode,
                },
                {
                  character: cs.characterId,
                  wins: cs.roleStats.Goalie.wins,
                  losses: cs.roleStats.Goalie.losses,
                  knockouts: cs.roleStats.Goalie.knockouts,
                  scores: cs.roleStats.Goalie.scores,
                  mvp: cs.roleStats.Goalie.mvp,
                  role: 'Goalie',
                  saves: cs.roleStats.Goalie.saves,
                  assists: cs.roleStats.Goalie.assists,
                  games: cs.roleStats.Goalie.games,
                  gamemode: cs.ratingName as Gamemode,
                },
              ]
            ),
          },
        },
        ratings: {
          create: {
            games:
              data.ensuredRegion?.player.games ||
              data.playerStats?.playerStats
                .filter((s) => s.ratingName === 'RankedInitial')
                .map(
                (s) => s.roleStats.Forward.games + s.roleStats.Goalie.games,
                )
                .reduce((a, b) => a + b, 0) ||
              0,
            losses:
              data.ensuredRegion?.player.losses ||
              data.playerStats?.playerStats
                .filter((s) => s.ratingName === 'RankedInitial')
                .map(
                (s) =>
                  s.roleStats.Forward.losses + s.roleStats.Goalie.losses,
                )
                .reduce((a, b) => a + b, 0) ||
              0,
            rank: data.ensuredRegion?.player.rank || 10_001,
            rating: data.ensuredRegion?.player.rating,
            wins:
              data.ensuredRegion?.player.wins ||
              data.playerStats?.playerStats
                .filter((s) => s.ratingName === 'RankedInitial')
                .map(
                (s) => s.roleStats.Forward.wins + s.roleStats.Goalie.wins,
                )
                .reduce((a, b) => a + b, 0) ||
              0,
            masteryLevel:
              data.ensuredRegion?.player.masteryLevel ||
              odysseyPlayer.masteryLevel ||
              0,
          },
        },
      },
    })

    dbLogger.info(`Created new Player successfully. (${odysseyPlayer.username})`);

    return createdPlayer;

  } catch (e) {
    dbLogger.error(`Error while CREATING PLAYER: `, e);
    return null;
  }   
}

export async function checkDiscord(player: PROMETHEUS.RAW.Player, discordId: string) {
  try {
    const dbUser = await prisma.player.findUnique({
      where: {
        id: player.playerId,
      },
      select: {
        discordId: true,
      }
    });

    const currentSnowflake = dbUser!.discordId

    if (currentSnowflake && currentSnowflake == discordId) // This and the function above makes sure the player doesn't already have the discordId bound.
    return; // No log, otherwise it would spam the shit out of console lol

    await prisma.player.update({
    where: {
      id: player.playerId,
    },
    data: {
      discordId: discordId
    }
    });
  
    discordLogger.info(`Set ${player.username}'s Discord ID to ${discordId}!`);
  } catch {
    discordLogger.error(`Failed to set ${player.username}'s Discord ID!`);
  }
  }