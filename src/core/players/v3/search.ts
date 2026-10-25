import { checkDiscord, checkUpdatePlayer, createPlayer, fixMismatch, usernameChanges } from '@/core/players/v2/databaseEdits';
import { handleCorestrike } from '@/core/players/v2/ghostPlayers';
import { calculatePlaystyle, fetchCachedPlayer, shouldUpdateUser, UpdateRequirements } from '@/core/players/v2/misc';
import { fetchOdyPlayer } from '@/core/players/v2/odysseyPlayers';
import { PROMETHEUS } from '@/types/prometheus';
import { appLogger } from '@/plugins/logger';
import { FastifyRequest } from 'fastify';
import { Gamemode, Player, Role } from '../../../../prisma/client';
import { prisma } from '@/plugins/prisma';
import { sendToAnalytics } from '@/core/analytics';
import dayjs from 'dayjs';
import { getTitleFromID } from '@/core/tools/titles';
import { ensurePlayerRegion, fetchCharacterMastery, fetchPlayerMastery, fetchPlayerStats } from '@/core/prometheus';
import { OurRegions, PlayerObjectType, PlayerObjectV3, PlayerRatingObjectType, PlayerV3Season } from '@/types/players';
import { getLatestSeason } from '@/core/cronjobs/seasons';
import { guessIfSmurf } from '../smurf';

const ensureLogger = appLogger('UserSearch')
const statusName = 'SoveReigN'; // weird casing to distinguish status server

export interface UserResponse {
  data: any;
  status: number;
  ok: boolean
  message?: string;
}


/**
 * Fits a cached V2 player to our V3 response type.
 *
 * @param cachedPlayer - Result of fetchCachedPlayer(). PlayerObjectType is shared with v2 and
 * can't be widened, so the two pieces it doesn't carry (leveling columns, per-character mastery
 * rows) are fetched/cast here instead.
 * @returns PlayerObjectV3 formatted for API responses.
 */
export async function fitV2UserToV3(cachedPlayer: PlayerObjectType): Promise<PlayerObjectV3> {

  // Drop 0s from history, but always keep the latest entry even if it's 0 (that's still worth knowing).
  const allRatings = cachedPlayer.ratings ?? [];
  const ratingTable = allRatings.length
    ? [allRatings[0], ...allRatings.slice(1).filter((r) => r.rating !== 0)].slice(0, 50)
    : [];

  const charTable = cachedPlayer.characterRatings ?? [];
  const teams = cachedPlayer.teams ?? [];

  const currentSeason = await getLatestSeason();
  const currentRating = ratingTable[0]?.rating ?? 0;
  const playstyle = calculatePlaystyle(charTable, currentRating);

  const characterMasteries = await prisma.playerCharacterMastery.findMany({
    where: { playerId: cachedPlayer.id },
  });

  // `PlayerRating.season` just holds the schema default; the real season a rating happened in
  // has to be derived from its createdAt against seasonDates.
  const ratingSeasons = await resolveRatingSeasons(ratingTable);

  const mostPlayedCharacter = charTable.length > 0
    ? charTable.reduce((max, c) => (c.games > max.games ? c : max))
    : null;

  const highestWinrateCharacter = charTable.length > 0
    ? charTable.reduce((max, c) =>
        (c.games > 0 ? c.wins / c.games : 0) > (max.games > 0 ? max.wins / max.games : 0) ? c : max
      )
    : null;

  const smurfResults = await guessIfSmurf(undefined, cachedPlayer);

  return {
    info: {
      playerId: cachedPlayer.id,
      username: cachedPlayer.username,
      nameplateId: cachedPlayer.nameplateId,
      emoticonId: cachedPlayer.emoticonId,
      titleId: cachedPlayer.titleId,
      title: cachedPlayer.title,
      region: cachedPlayer.region,
      tags: cachedPlayer.tags,
      socialUrl: cachedPlayer.socialUrl,
      discord: {
        id: cachedPlayer.discordId,
        overwritten: cachedPlayer.forcedDID
      },
    },
    leveling: {
      currentLevel: cachedPlayer.currentLevel,
      currentLevelXp: cachedPlayer.currentXp,
      xpToNextLevel: cachedPlayer.xpToNextLevel,
      totalXp: cachedPlayer.totalXp,
    },
    latestRatings: ratingTable
      .map((r) => ({
        rating: r.rating,
        ranking: {
          global: r.rank,
          region: r.regionRanking
        },
        region: cachedPlayer.region as OurRegions,
        games: r.games,
        wins: r.wins,
        losses: r.losses,
        season: ratingSeasons.get(r.id) ?? currentSeason.season,
        createdAt: r.createdAt
      }))
    ,
    seasons: await sliceRatingsBySeason(ratingTable),
    characterStats: charTable
      .map((c) => ({
        characterId: c.character,
        role: c.role as Role,
        games: c.games,
        wins: c.wins,
        losses: c.losses,
        scores: c.scores,
        assists: c.assists,
        saves: c.saves,
        knockouts: c.knockouts,
        mvp: c.mvp,
        gamemode: (c.gamemode == 'RankedInitial' ? 'Ranked' : 'Normal'),
        createdAt: c.createdAt,
      }))
    ,
    characterMasteries: characterMasteries
      .map((c) => ({
        characterId: c.characterId,
        currentTier: c.currentTier,
        currentTierXp: c.currentTierXp,
        xpToNextTier: c.xpToNextTier,
        totalXp: c.totalXp,
      }))
    ,
    accolades: {
      bestCharacter: highestWinrateCharacter,
      favCharacter: mostPlayedCharacter,
    },
    teams,
    playStyle: playstyle,
    smurfing: smurfResults,
    assets: {
      nameplate: `${process.env.API_BASE_URL}/assets/nameplate/${cachedPlayer.nameplateId}.webp`
    },
    currentSeason: currentSeason.season,
    createdAt: cachedPlayer.createdAt,
    updatedAt: cachedPlayer.updatedAt,
  }
}

// for "seasons", calculated at runtime (by design)
// despite being for V3, only accepts V2 rating objects (since thats how its stored in DB)
export async function sliceRatingsBySeason(ratings: PlayerRatingObjectType[]): Promise<PlayerV3Season[]> {
  // Newest season first, to match the (assumed) newest-first ordering of `ratings`.
  const seasons = await prisma.seasonDates.findMany({ orderBy: { season: 'desc' } });

  const buckets = new Map<number, { peak: number; final: number }>();
  let seasonIdx = 0;

  for (const r of ratings) {
    if (!r.createdAt) continue;
    const createdAt = r.createdAt.getTime();

    // Advance to the season this rating actually falls in.
    // Season ranges are contiguous, so we only need to check the lower bound.
    while (seasonIdx < seasons.length - 1 && createdAt < seasons[seasonIdx].startDate.getTime()) {
      seasonIdx++;
    }

    const season = seasons[seasonIdx];
    if (!season || createdAt < season.startDate.getTime()) continue; // older than any known season

    const bucket = buckets.get(season.season);
    if (!bucket) {
      // First hit per season (in newest-first order) is the season's final rating.
      buckets.set(season.season, { peak: r.rating, final: r.rating });
    } else {
      bucket.peak = Math.max(bucket.peak, r.rating);
    }
  }

  return Array.from(buckets.entries())
    .map(([season, { peak, final }]) => ({ season, peakRating: peak, finalRating: final }))
    .sort((a, b) => b.season - a.season);
}


// The "Season" column in the ratings table isn't reliable currently (it will be later).
// So the season a rating actually happened in, has to be derived from its 'createdAt' against `seasonDates`.
async function resolveRatingSeasons(ratings: PlayerRatingObjectType[]): Promise<Map<number, number>> {
  const seasons = await prisma.seasonDates.findMany({ orderBy: { season: 'desc' } });

  const result = new Map<number, number>();
  let seasonIdx = 0;

  for (const r of ratings) {
    if (!r.createdAt) continue;
    const createdAt = r.createdAt.getTime();

    // Advance to the season this rating actually falls in.
    // Season ranges are contiguous, so we only need to check the lower bound.
    while (seasonIdx < seasons.length - 1 && createdAt < seasons[seasonIdx].startDate.getTime()) {
      seasonIdx++;
    }

    const season = seasons[seasonIdx];
    if (!season || createdAt < season.startDate.getTime()) continue; // older than any known season

    result.set(r.id, season.season);
  }

  return result;
}

export async function searchByUsername(name: string, req: FastifyRequest, region?: string, cached?: boolean, mode?: 'Ranked' | 'Normal'): Promise<UserResponse> {
  // Existing Username Fetching.
  const decodedUser = decodeURI(name);
  let regText = '';
  if (region) { regText = ` in region ${region}.` };
  
  // Make region default to Global.
  if (name !== statusName) { ensureLogger.info(`Requesting data for: '${decodedUser}'${regText}`); }

  // We do get the cachedPlayer, but we do not return him by himself because we need to check if he needs to be updated.
  // If he needs to be updated, we will return the updated player based on the cachedPlayerData instead of making multiple odyssey requests.
  let cachedPlayer = await fetchCachedPlayer(decodedUser, undefined, 200);

  if (cachedPlayer) { 
    ensureLogger.debug(`Found Cached Data for: '${decodeURI(cachedPlayer?.username)}' with ${cachedPlayer?.ratings?.length} rating points.`);
  
    // If cached argument is true, return HERE.
    if (cached && cachedPlayer) {
      ensureLogger.info('Cached Player Requested. Returning cached data...');
      await sendToAnalytics('V2_PLAYERS_CACHED', req.ip, req.user?.id, `${cachedPlayer.username}`);
      return {
        data: await fitV2UserToV3(cachedPlayer),
        status: 200,
        ok: true
      };
    }
  } else { 
    ensureLogger.warn(`Failed to find cached data for: '${decodedUser}'. Continuing...`);
  }
  

  // Automatically swaps protocols if the username is 1 character long.
  // Also `name` takes priority since it is set.
  const odysseyPlayer = await fetchOdyPlayer(name, cachedPlayer);

  if (!odysseyPlayer) {
    return {
      data: {},
      status: 404,
      message: "User could not be confirmed by Odyssey",
      ok: false
    };
  }

  let ensuredRegion;

  // NEW 'mode': Only ensure region if we're actually searching for ranked info, otherwise save time and skip
  if (mode !== 'Normal') {
    try {
      // Will probably just leave this here tbh.
      ensuredRegion = await ensurePlayerRegion(
        odysseyPlayer.playerId,
        region || (cachedPlayer?.region === "Global" ? undefined : cachedPlayer?.region as PROMETHEUS.RAW.Regions) || undefined,
      );
      if (ensuredRegion) {
        if (ensuredRegion?.region == undefined) {
          ensuredRegion.region = 'Global';
          ensureLogger.warn(`Could not find (${decodeURI(name)})'s region. Using ${ensuredRegion?.region} instead.`);
        } else {
          if (name !== statusName) { ensureLogger.info(`Found ${decodeURI(name)}'s region: ${ensuredRegion?.region}`); };

          if (cachedPlayer && (cachedPlayer.region == 'Global' || cachedPlayer.region == null)) {
            ensureLogger.warn(`Setting ${cachedPlayer.username}'s region to ${ensuredRegion.region} locally!`);
            await prisma.player.update({ where: { id: cachedPlayer.id }, data: { region: ensuredRegion.region } });
            cachedPlayer = { // Update already-fetched cachedPlayer
              ...cachedPlayer,
              region: ensuredRegion.region
            }
          }
        }
      } else {
        ensureLogger.error(`Failed to find a valid region for (${decodeURI(name)}). Do they even play ranked?`);
      }
    } catch (error) {
      ensureLogger.error(`Something went wrong while ENSURING PLAYER REGION: `, error);
    }
  }
  
  if (name !== statusName) await sendToAnalytics('V2_PLAYERS', req.ip, req.user?.id, `${odysseyPlayer.username}`);

  // (Player and Character Stats)

  // Add fallback for ID search using Odyssey Player.
  if (!cachedPlayer) {
    cachedPlayer = await fetchCachedPlayer(undefined, odysseyPlayer.playerId, 200);

    // No players exist in database with that username or that userId.
    // BUT they do exist in Odyssey's database.
    // This means we need to create a new player on our end.

    if (!cachedPlayer) {
      const ensuredRegion = await ensurePlayerRegion(
        odysseyPlayer.playerId,
        region || undefined,
      );

      const playerStats = await fetchPlayerStats(odysseyPlayer.playerId);
      ensureLogger.debug(`Obtained Advanced Stats for New Player '${decodedUser}'`);

      const createdPlayer = await createPlayer({odysseyPlayer, ensuredRegion, playerStats});

      // Check if we can link them to any teams.
      const teamMatches = await prisma.esportsPlayers.findMany({ where: { userId: createdPlayer.id } });
      if (teamMatches) {
        for (const team of teamMatches) {
          ensureLogger.info(`Linking '${createdPlayer.username}' to Team '${team.teamName}'!`)
          await prisma.esportsPlayers.update({
            where: {
              userId_teamName_series_season: {
                userId: team.userId!,
                teamName: team.teamName,
                series: team.series,
                season: team.season
              },
            },
            data: {
              linkedId: createdPlayer.id,
            },
          });
        }
      };

      // This might take a bit longer, but its much more resilient.
      const mastery = await fetchPlayerMastery(odysseyPlayer.playerId);
      await prisma.player.update({
        where: { id: odysseyPlayer.playerId },
        data: {
          currentLevel: mastery.currentLevel,
          currentXp: mastery.currentLevelXp,
          xpToNextLevel: mastery.xpToNextLevel,
          totalXp: mastery.totalXp,
        }
      });

      const cached = await fetchCachedPlayer(odysseyPlayer.username, undefined, 200);
      const v3 = await fitV2UserToV3(cached);

      return {
        data: v3,
        status: 201,
        ok: true
      };
    }
  }


  // Attempts to link Corestrike import data to this user
  if (cachedPlayer && cachedPlayer.id.includes('NOTSET')) {
    cachedPlayer = await handleCorestrike(cachedPlayer, odysseyPlayer);
  }
  

  // This happens once in a while for some reason.
  // Basically Odyssey decides to just seemingly randomly change someone's PlayerID.
  // This causes loads of errors since the ID is the source of truth, and it cannot be trusted anymore.
  // Attempt to delete smaller, dead accounts, but bail out if fails. Requires manual fixing in Prisma Studio.
  if (cachedPlayer && odysseyPlayer.playerId !== cachedPlayer.id) {
    ensureLogger.error(`Player ID mismatch!! (${odysseyPlayer.username}) CachedID: ${cachedPlayer.id}, OdysseyID: ${odysseyPlayer.playerId}`);
    
    cachedPlayer = await fixMismatch(cachedPlayer, odysseyPlayer);

    if (cachedPlayer == null) {
      return {
        data: {},
        status: 500,
        message: "Player ID mismatch. Please notify dsit on Discord.",
        ok: false
      };
    }
  }

  // If the usernames are different, but the userID is the same, update the saved username.
  if (cachedPlayer && cachedPlayer.username.toLocaleLowerCase() != odysseyPlayer.username.toLocaleLowerCase() && cachedPlayer.id == odysseyPlayer.playerId) {
    ensureLogger.warn(`Player Username Changed! (${cachedPlayer.username}) -> (${odysseyPlayer.username.toLocaleLowerCase()}), Matching ID: ${odysseyPlayer.playerId}`);

    cachedPlayer = await usernameChanges(cachedPlayer, odysseyPlayer);
  }

  // If the stored copy has different casing, just update it and move on.
  if (cachedPlayer && cachedPlayer.username != odysseyPlayer.username && cachedPlayer.id == odysseyPlayer.playerId) {
    try {
      await prisma.player.update({
        where: { id: odysseyPlayer.playerId },
        data: { username: odysseyPlayer.username },
      });
      cachedPlayer.username = odysseyPlayer.username; // Update for rest of script
    } catch (error) {
      ensureLogger.error(`Failed Update Player's Username Casing:`, error);
    }
  }


  // Check if player is Ghost or not.
  // (Profiles have not been fully filled out yet, but have one or more ratings attached.)

  const isGhostProfile = cachedPlayer && (!cachedPlayer.characterRatings || !cachedPlayer.emoticonId);

  // Check if player needs updating.
  const playerMastery: PROMETHEUS.API.MASTERY.Player = await fetchPlayerMastery(odysseyPlayer.playerId || cachedPlayer?.id)
  const updateParams: UpdateRequirements = {
    cachedPlayer,
    playerMastery,
    ensuredRegion,
    isGhostProfile,
  }

  const isNorms = (mode && mode == 'Normal');
  const ignoreUpdates = shouldUpdateUser(updateParams, isNorms);

  if (odysseyPlayer.platformIds?.discord) {
    await checkDiscord(odysseyPlayer);
  }

  // Player has not played the game since their last update.
  if (ignoreUpdates) {
    if (name !== statusName) { ensureLogger.info(`Player Stats haven't changed since last update. Returning partially cached player.`); };
    const getTitle = getTitleFromID(odysseyPlayer.titleId);
    const v3 = await fitV2UserToV3(cachedPlayer);

    return {
      data: {
        ...v3,
        title: getTitle ? getTitle.en : null,
        leveling: {
          currentLevel: playerMastery.currentLevel,
          currentLevelXp: playerMastery.currentLevelXp,
          totalXp: playerMastery.totalXp,
          xpToNextLevel: playerMastery.xpToNextLevel
        },
      },
      status: 200,
      ok: true
    };
  }

  // AKA, (ignoreUpdates) is FALSE, and we need to update them now.
  // Can use odysseyPlayer as much as you want now. (Depending on context)
  // Also cachedPlayer definitely exists (by this point) and matches odysseyPlayer (to some extent).
  
  ensureLogger.info(`Updating profile of '${decodedUser}'...`);
    
  const getTitle = getTitleFromID(odysseyPlayer.titleId);

  // Update basic info first
  await prisma.player.update({
    where: {
      id: cachedPlayer.id,
    },
    data: {
      currentXp: playerMastery.currentLevelXp,
      emoticonId: odysseyPlayer.emoticonId,
      logoId: odysseyPlayer.logoId,
      titleId: odysseyPlayer.titleId,
      title: getTitle ? getTitle.en : null,
      nameplateId: odysseyPlayer.nameplateId,
      socialUrl: odysseyPlayer.socialUrl,
      tags: odysseyPlayer.tags,
      currentLevel: playerMastery.currentLevel,
      xpToNextLevel: playerMastery.xpToNextLevel,
      totalXp: playerMastery.totalXp,
      // username: odysseyPlayer.username,
      ...((ensuredRegion && !cachedPlayer.region || cachedPlayer.region == 'Global') && { region: ensuredRegion.region }),
    },
  })

  await checkUpdatePlayer({cachedPlayer, ensuredRegion, mastery: playerMastery});

  // advanced stats (beginning)
  // Only runs if it needs to update.
  ensureLogger.verbose(`Obtaining Advanced Stats for '${decodedUser}'...`);
  const playerStats = await fetchPlayerStats(odysseyPlayer.playerId)
  ensureLogger.debug(`Obtained Advanced Stats for '${decodedUser}'`);
  
  if (playerStats) {
    ensureLogger.debug(`Checking existing player stats for player (${name})`);
  
    const existingCharacterRatings = await prisma.playerCharacterRating.findMany({
      where: { playerId: odysseyPlayer.playerId },
    });
  
    const existingCharacterRatingsMap = new Map(
      existingCharacterRatings.map((rating) => [
        `${rating.playerId}|${rating.character}|${rating.role}|${rating.gamemode}`,
        rating,
      ])
    );
    
    const newCharacterRatings: any = [];
    const updateCharacterRatings: any = [];
    
    ensureLogger.debug(`Generating current keys for player (${odysseyPlayer.username})`);
    playerStats.characterStats.forEach((cs: any) => {
      if (cs.ratingName === 'None') return;
    
      const forwardKey = `${odysseyPlayer.playerId}|${cs.characterId}|Forward|${cs.ratingName}`;
      const goalieKey = `${odysseyPlayer.playerId}|${cs.characterId}|Goalie|${cs.ratingName}`;

      const createRoleData = (role: 'Forward' | 'Goalie') => ({
        character: cs.characterId,
        wins: cs.roleStats[role].wins,
        losses: cs.roleStats[role].losses,
        knockouts: cs.roleStats[role].knockouts,
        scores: cs.roleStats[role].scores,
        mvp: cs.roleStats[role].mvp,
        role,
        saves: cs.roleStats[role].saves,
        assists: cs.roleStats[role].assists,
        games: cs.roleStats[role].games,
        gamemode: cs.ratingName as Gamemode,
        playerId: odysseyPlayer.playerId,
        createdAt: dayjs().toISOString(),
      });
      
      const forwardData = createRoleData('Forward');
      const goalieData = createRoleData('Goalie');

    
      if (!existingCharacterRatingsMap.has(forwardKey)) {
        newCharacterRatings.push(forwardData);
      } else {
        updateCharacterRatings.push(forwardData);
      }
    
      if (!existingCharacterRatingsMap.has(goalieKey)) {
        newCharacterRatings.push(goalieData);
      } else {
        updateCharacterRatings.push(goalieData);
      }
    });
  
    if (newCharacterRatings.length > 0) {
      ensureLogger.debug(`Creating new player stats for player (${name})`);
      await prisma.playerCharacterRating.createMany({
        data: newCharacterRatings,
      });
    }
    
    for (const rating of updateCharacterRatings) {
      await prisma.playerCharacterRating.upsert({
        where: {
          player_character_role_game_unique: {
            playerId: rating.playerId,
            character: rating.character,
            role: rating.role,
            gamemode: rating.gamemode,
          },
        },
        update: {
          games: rating.games,
          assists: rating.assists,
          knockouts: rating.knockouts,
          losses: rating.losses,
          mvp: rating.mvp,
          saves: rating.saves,
          scores: rating.scores,
          wins: rating.wins,
          createdAt: rating.createdAt,
        },
        create: rating,
      });
    }

    ensureLogger.debug(`Updating character masteries for (${name})...`);

    // Character Masteries
    const odyCharMast = await fetchCharacterMastery(odysseyPlayer.playerId);
    await prisma.$transaction(
      odyCharMast.characterMasteries.map((cm) =>
        prisma.playerCharacterMastery.upsert({
          where: {
            player_character_unique: {
              playerId: odysseyPlayer.playerId,
              characterId: cm.characterAssetName,
            },
          },
          update: {
            totalXp: cm.totalXp,
            maxTier: cm.maxTier,
            highestTierCollected: cm.idxHighestTierCollected,
            currentTier: cm.currentTier,
            currentTierXp: cm.currentTierXp,
            xpToNextTier: cm.xpToNextTier,
          },
          create: {
            playerId: odysseyPlayer.playerId,
            characterId: cm.characterAssetName,
            totalXp: cm.totalXp,
            maxTier: cm.maxTier,
            highestTierCollected: cm.idxHighestTierCollected,
            currentTier: cm.currentTier,
            currentTierXp: cm.currentTierXp,
            xpToNextTier: cm.xpToNextTier,
          },
        })
      )
    );

    ensureLogger.info(`Finished updating player '${name}'.`);
    const fullyUpdated = await fetchCachedPlayer(odysseyPlayer.username, undefined, 200);
    const v3 = await fitV2UserToV3(fullyUpdated);

    return {
      data: v3,
      status: 200,
      ok: true
    };
  };
};