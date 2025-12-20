import { OurRegions, PlayerObjectType } from '@/types/players';
import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';
import { handleCorestrike } from '../players/ghostPlayers';
import { areDifferentDays, sleep } from '../utils';
import { Player } from '../../../prisma/client';
import { checkDiscord, usernameChanges } from '../players/databaseEdits';
import { PROMETHEUS } from '@/types/prometheus';
import { getRankFromLP } from '../ranks';
import { fetchRankedPlayers } from '../prometheus';

const leaderboardLogger = appLogger('Leaderboard')
const maxRanks = 9999; // Never set to 10K or above, it'll stall and error out :monkaS:
  
export async function updateLeaderboard() {
  await prisma.leaderboard.deleteMany()

  const updates: Promise<any>[] = []
  for (const region of [
    'Global',
    'NorthAmerica',
    'Europe',
    'Asia',
    'SouthAmerica',
    'Oceania',
    'JapaneseLanguageText',
  ]) {
    updates.push(populateByBoardOffset(0, 25, region as OurRegions))
  }
  await Promise.all(updates)

  leaderboardLogger.info('Successfully updated leaderboard for all regions.');
}

let playersCounted = 0;

async function populateByBoardOffset(offset = 0, count = 25, region?: OurRegions) {
  leaderboardLogger.info(
    `Updating leaderboard for ${region} with > Offset:${offset} Step: ${count}`,
  )
  const leaderboardPlayers: PROMETHEUS.API.RANKED.LEADERBOARD.Players = await fetchRankedPlayers(
    offset,
    count,
    region === 'Global' ? undefined : region,
  )
  for (const player of leaderboardPlayers.players) {
    if (player.rank >= maxRanks + 1) {
      leaderboardLogger.verbose(
        `Reached rank ${maxRanks} or above, stopping updates for ${region}.`,
      )
      return;  // Stop processing once rank 100 is reached
    }
    
    playersCounted++ // Add 1 to variable.
    leaderboardLogger.debug(
      `(${playersCounted}/${maxRanks * 7}) Updating player ${player.playerId} #${player.rank} @ ${region}`,
    )
    try {
      const topChar = player.mostPlayedCharacters.reduce((max, curr) => {
        return curr.gamesPlayed > max.gamesPlayed ? curr : max;
      })

      await prisma.leaderboard.create({
        data: {
          playerId: player.playerId,
          region: region,
          rank: player.rank,
          rating: player.rating,
          topRole: player.topRole,
          wins: player.wins,
          losses: player.losses,
          winrate: Number(((player.wins / player.games)*100).toFixed(1)),
          emoticonId: player.emoticonId,
          nameplateId: player.nameplateId,
          masteryLevel: player.masteryLevel,
          socialUrl: player.socialUrl,
          tags: player.tags,
          titleId: player.titleId,
          username: player.username,
          topCharacter: topChar.characterId,
          rankName: getRankFromLP(player.rating).rankObject.name,
        },
      })

      const latestPlayerObject = await prisma.player.findUnique({
        where: {
          id: player.playerId,
        },
        select: {
          updatedAt: true,
          ratings: {
            select: {
              id: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      })

      async function insertRating(newRating: number, player: any) {
        // Fetch the latest rating for this player
        const latestRating = await prisma.playerRating.findFirst({
          where: {
            playerId: player.playerId,
          },
          orderBy: { createdAt: 'desc' },
        });
      
        // Get the current date and time
        const ratingDate = new Date().toISOString();
      
        // Check if the player exists in the Player table
        let existingPlayer: PlayerObjectType = await prisma.player.findUnique({
          where: { id: player.playerId },
        });

        let existingUser: Player = await prisma.player.findUnique({
          where: { username: player.username },
        })

        // console.error(`Username: ${player.username}, ID: ${player.playerId}`);

        if (existingUser && existingUser.id.includes("NOTSET")) {
          existingPlayer = await handleCorestrike(existingUser, player);
          leaderboardLogger.warn(`Existing Username '${player.username}' linked to player Id ${player.playerId}!`);
        }

        // If the usernames are different, but the userID is the same, update the saved username.
        if (existingPlayer && existingPlayer.username.toLocaleLowerCase() != player.username.toLocaleLowerCase() && existingPlayer.id == player.playerId) {
          leaderboardLogger.warn(`Player Username Changed! (${existingPlayer.username}) -> (${player.username.toLocaleLowerCase()}), Matching ID: ${player.playerId}`);
    
          existingPlayer = await usernameChanges(existingPlayer, player);
        }
        
        // If the stored copy has different casing, just update it and move on.
        if (existingPlayer && existingPlayer.username != player.username && existingPlayer.id == player.playerId) {
          try {
            await prisma.player.update({
              where: { id: player.playerId },
              data: { username: player.username },
            });
            existingPlayer.username = player.username; // Update for rest of script
          } catch (error) {
            leaderboardLogger.error(`Failed Update Player's Username Casing:`, error);
          }
        }
      
        // If the player doesn't exist, create a new player entry and add the single rating
        if (!existingPlayer) {
          await prisma.player.create({
            data: {
              id: player.playerId,
              region: region,
              username: player.username,
              ratings: {
                create: {
                  rating: newRating,
                  createdAt: ratingDate,
                  games: player.games || 0,
                  wins: player.wins || 0,
                  losses: player.losses || 0,
                  masteryLevel: player.masteryLevel || 0,
                  rank: player.rank || 10_001,
                },
              },
            },
          });
          leaderboardLogger.debug(`New player '${player.playerId}' created with initial rating.`);
        } else {
          // If there is no rating history or the new rating is different, insert it
          if (!latestRating || latestRating.rating !== newRating) {
            leaderboardLogger.debug(`Player '${player.playerId}' (#${player.rank} @ ${region}) has changed rating. Updating now.`);
      
            await prisma.playerRating.create({
              data: {
                playerId: player.playerId,
                rating: newRating,
                createdAt: ratingDate,
                games: player.games || 0,
                wins: player.wins || 0,
                losses: player.losses || 0,
                masteryLevel: player.masteryLevel || 0,
                rank: player.rank || 10_001,
              },
            });
          }
        }
      }
      await insertRating(player.rating, player);
      if (player.platformIds?.discord) {
        await checkDiscord(player, player.platformIds.discord.discordId)
      }

      async function logPlayerRating(playerId: string, newRating: number) {
        try {
          // Fetch the most recent rating for the player
          const lastEntry = await prisma.ratingHistory.findFirst({
            where: { playerId },
            orderBy: {
              timestamp: 'desc', // Get the latest entry
            },
          });
      
          // Check if the new rating is different from the last one
          if (!lastEntry || lastEntry.rating !== newRating) {
            // Log the new rating if it's different
            await prisma.ratingHistory.create({
              data: {
                playerId: playerId,
                rating: newRating,
                timestamp: new Date(),
              },
            });
            leaderboardLogger.verbose(`New rating logged for Player: ${playerId}, rating: ${newRating}`);
          }
        } catch (error) {
          leaderboardLogger.error('Error logging player rating:', error);
        }
      }

      await logPlayerRating(player.playerId, player.rating)
      // if (!latestPlayerObject) {
      //   leaderboardLogger.debug(
      //     `Inserted player ${player.playerId} #${player.rank} @ ${region} - Does not have strikr ratings saved.`,
      //   )
      // }

      let operation: 'create' | 'update' = 'create'
      if (
        latestPlayerObject?.ratings?.[0] &&
        !areDifferentDays(
          latestPlayerObject.ratings[0].createdAt.toISOString(),
          new Date().toISOString(),
        )
      ) {
        operation = 'update'
      }
      
      if (player.rank < maxRanks) {
        // leaderboardLogger.debug(
        //   `Inserted player ${player.playerId} #${player.rank} @ ${region}.`,
        // )

      } else {
        leaderboardLogger.verbose(
          `Player ${player.playerId} #${player.rank} @ ${region} is greater than max threshold (${maxRanks}).`,
        )
        continue
      }
    } catch (e) {
      // leaderboardLogger.error(
      //   `Error updating player ${player.playerId} #${player.rank} @ ${region}: ${e}.`,
      // )
    }
  }

  if (leaderboardPlayers.paging.totalItems > offset + count) {
    await populateByBoardOffset(offset + count, count, region)
  }
}