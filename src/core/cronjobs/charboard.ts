import { PROMETHEUS } from "@/types/prometheus";
import { appLogger } from "../../plugins/logger";
import { prisma } from '../../plugins/prisma';
import { sleep } from "../utils";
import { getRankGroup } from "../ranks";
import { PlayerLeaderboardType } from "../../types/players";

const leaderboardLogger = appLogger('CharacterLeaderboard');

export async function updateCharacterBoard() {
  leaderboardLogger.info('Running cronjob.');

  // Push Historical Data Entries
  await pushHistory();

  // Clear the CharacterLeaderboard table
  await clearTable();

  const globalData: { [key: string]: { games: number; wins: number; losses: number; } } = {};

  const regions: PROMETHEUS.RAW.Regions[] = [
    'NorthAmerica',
    'Europe',
    'Asia',
    'SouthAmerica',
    'Oceania',
    'JapaneseLanguageText',
  ];

  await Promise.all(
    regions.map(async (region) => {
      // for (let i = 0; i < 400; i++) { // ALL RANKS (prod only)
      for (let i = 0; i < 10; i++) {
        const startRank = i * 25 + 1;
        try {
          const data = await prometheusService.ranked.leaderboard.players(startRank, 25, region);
          const players = data.players;

          // Parallelize only the player processing (your requirement)
          await Promise.all(
            players.map(async (player: PlayerLeaderboardType) => {
              const playerId = player.playerId;
              const rankGroup = getRankGroup(player.rating);
              await processPlayerData(playerId, region, rankGroup, globalData);
              await sleep(50); // still rate-limited per player
            })
          );
        } catch (err) {
          leaderboardLogger.warn(`Failed to fetch region ${region} page ${i + 1}:`, err);
        }
      }

      leaderboardLogger.info(`Finished region ${region}`);
    })
  );

  // Insert global data
  await insertGlobalData(globalData);
}

async function pushHistory() {
  try {
    leaderboardLogger.info('Pushing historical character leaderboard data...');
    const currentEntries = await prisma.characterLeaderboard.findMany();
    
    // Get current time and round off mins and seconds
    const now = new Date();
    now.setMinutes(0, 0, 0);

    // Append adjusted time
    const historyEntries = currentEntries.map(entry => ({
      ...entry,
      createdAt: now,
    }));

    await prisma.charBoardHistory.createMany({
      data: historyEntries
    })

    leaderboardLogger.info('Pushed historical character leaderboard data!');

  } catch (error) {
    leaderboardLogger.error(`Error pushing historical CharacterLeaderboard entries: ${error}`);
  }
}

async function clearTable() {
  try {
    await prisma.characterLeaderboard.deleteMany();
    leaderboardLogger.info('Cleared the CharacterLeaderboard table');
  } catch (error) {
    leaderboardLogger.error(`Error clearing CharacterLeaderboard table: ${error}`);
  }
}

async function processPlayerData(playerId: string, region: PROMETHEUS.RAW.Regions, rankGroup: string, globalData: { [key: string]: { games: number; wins: number; losses: number; } }) {
  try {
    const data = await prometheusService.stats.player(playerId);
    const characterStats = data.characterStats;
    leaderboardLogger.verbose(`Received data for player ${playerId} in ${region}.`);

    for (const characterStat of characterStats) {
      const characterId = characterStat.characterId;
      const ratingName = characterStat.ratingName;

      if (ratingName === 'NormalInitial' || ratingName === 'RankedInitial') {
        await processRoleStats(characterStat.roleStats.Forward, characterId, ratingName, region, 'Forward', rankGroup, globalData);
        await processRoleStats(characterStat.roleStats.Goalie, characterId, ratingName, region, 'Goalie', rankGroup, globalData);
      }
    }
  } catch (error) {
    leaderboardLogger.error(`Error fetching data for player ${playerId}: ${error}`);
  }
}

async function processRoleStats(roleStats: any, characterId: string, ratingName: string, region: PROMETHEUS.RAW.Regions, role: string, rankGroup: string, globalData: { [key: string]: { games: number; wins: number; losses: number; } }) {
  if (!roleStats) return;

  const { games, wins, losses } = roleStats;

  const key = `${characterId}|${ratingName}|${role}|${rankGroup}`;

  // Aggregate data for Global region
  if (!globalData[key]) {
    globalData[key] = { games: 0, wins: 0, losses: 0 };
  }
  globalData[key].games += games;
  globalData[key].wins += wins;
  globalData[key].losses += losses;

  try {
    await prisma.characterLeaderboard.upsert({
      where: {
        character_gamemode_region_role_rankGroup: {
          character: characterId,
          gamemode: ratingName,
          region: region,
          role: role,
          rankGroup
        },
      },
      update: {
        games: {
          increment: games,
        },
        wins: {
          increment: wins,
        },
        losses: {
          increment: losses,
        },
      },
      create: {
        character: characterId,
        gamemode: ratingName,
        games: games,
        wins: wins,
        losses: losses,
        region: region,
        role: role,
        rankGroup
      },
    });

    // leaderboardLogger.debug(`Upserted data for character ${characterId} in gamemode ${ratingName}, role ${role} for region ${region}`);
  } catch (error) {
    leaderboardLogger.error(`Error upserting data for character ${characterId}: ${error}`);
  }
}

async function insertGlobalData(globalData: { [key: string]: { games: number; wins: number; losses: number; } }) {
  for (const key in globalData) {
    const [characterId, ratingName, role, rankGroup] = key.split('|');
    const { games, wins, losses } = globalData[key];

    try {
      await prisma.characterLeaderboard.upsert({
        where: {
          character_gamemode_region_role_rankGroup: {
            character: characterId,
            gamemode: ratingName,
            region: 'Global',
            role: role,
            rankGroup
          },
        },
        update: {
          games: {
            increment: games,
          },
          wins: {
            increment: wins,
          },
          losses: {
            increment: losses,
          },
        },
        create: {
          character: characterId,
          gamemode: ratingName,
          games: games,
          wins: wins,
          losses: losses,
          region: 'Global',
          role: role,
          rankGroup
        },
      });

      leaderboardLogger.debug(`Upserted global data for character ${characterId} in gamemode ${ratingName}, role ${role}`);
    } catch (error) {
      leaderboardLogger.error(`Error upserting global data for character ${characterId}: ${error}`);
    }
  }
}