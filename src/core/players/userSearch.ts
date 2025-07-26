import { checkDiscord, checkUpdatePlayer, createPlayer, fixMismatch, usernameChanges } from '../../core/players/databaseEdits';
import { handleCorestrike } from '../../core/players/ghostPlayers';
import { fetchCachedPlayer, shouldUpdateUser, UpdateRequirements } from '../../core/players/misc';
import { fetchOdyPlayer } from '../../core/players/odysseyPlayers';
import { getTypeOfInput } from '../../core/utils';
import { PROMETHEUS } from '../../types/prometheus';
import { appLogger } from '../../plugins/logger';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { Gamemode } from '../../../prisma/client';
import { prisma } from '../../plugins/prisma';
import { sendToAnalytics } from '../../core/analytics';
import { searchByID } from '../../core/players/idSearch';
import dayjs from 'dayjs';

const ensureLogger = appLogger('UserSearch')

export interface UserResponse {
  data: any;
  status: number;
  ok: boolean
  message?: string;
}

export async function usernameSearch(name: string, req: FastifyRequest, region?: string, cached?: boolean): Promise<UserResponse> {
  // Existing Username Fetching.
  const decodedUser = decodeURI(name);
  let cachedPlayer = undefined;
  let regText = '';
  if (region) { regText = ` in region ${region}.` };
  
  // Make region default to Global.
  ensureLogger.info(`Requesting data for: '${decodedUser}'${regText}`);

  // We do get the cachedPlayer, but we do not return him by himself because we need to check if he needs to be updated.
  // If he needs to be updated, we will return the updated player based on the cachedPlayerData instead of making multiple odyssey requests.
  cachedPlayer = await fetchCachedPlayer(decodedUser);

  if (cachedPlayer) { 
    ensureLogger.debug(`Found Cached Data for: '${decodeURI(cachedPlayer?.username)}' with ${cachedPlayer?.ratings?.length} rating points.`);
  
    // If cached argument is true, return HERE.
    if (cached && cachedPlayer) {
      ensureLogger.info('Cached Player Requested. Returning cached data...');
      await sendToAnalytics('V2_PLAYERS_CACHED', req.ip, req.user!.id, `${cachedPlayer.username}`);
      return {
        data: {
          ...cachedPlayer,
          ratings: cachedPlayer.ratings,
        },
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
      message: "User could not be found",
      ok: false
    };
  }

  // Will probably just leave this here tbh.
  let ensuredRegion =
    await prometheusService.ranked.leaderboard.ensureRegion(
      odysseyPlayer.playerId,
      region || (cachedPlayer?.region as PROMETHEUS.RAW.Regions) || undefined,
    )
  if (ensuredRegion) {
    if (ensuredRegion?.region == undefined) {
      ensuredRegion.region = 'Global';
      ensureLogger.warn(`Could not find (${decodeURI(name)})'s region. Using ${ensuredRegion?.region} instead.`);
    } else {
      ensureLogger.info(`Found ${decodeURI(name)}'s region: ${ensuredRegion?.region}`);
    }
  } else {
    ensureLogger.error(`Failed to find a valid region for (${decodeURI(name)}). Do they even play ranked?`);
  }
  
  // Weird casing to be specific to uptime server.
  if (name !== 'SoveReigN') await sendToAnalytics('V2_PLAYERS', req.ip, req.user!.id, `${odysseyPlayer.username}`);

  // (Player and Character Stats)

  // Add fallback for ID search using Odyssey Player.
  if (!cachedPlayer) {
    cachedPlayer = await fetchCachedPlayer(undefined, odysseyPlayer.playerId)

    // No players exist in database with that username or that userId.
    // BUT they do exist in Odyssey's database.
    // This means we need to create a new player on our end.

    if (!cachedPlayer) {
      const ensuredRegion = await prometheusService.ranked.leaderboard.ensureRegion(
        odysseyPlayer.playerId,
        region || undefined,
      )

      const playerStats = await prometheusService.stats.player(odysseyPlayer.playerId)
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

      const newPlayer = await fetchCachedPlayer(odysseyPlayer.username);

      return {
        data: newPlayer,
        status: 201,
        ok: true
      };
    }
  }


  // Handle this before release. It works, but I'm not entirely sure what it does.
  // Like why is it so complicated?
  if (cachedPlayer && cachedPlayer.id.includes('NOTSET')) {
    cachedPlayer = await handleCorestrike(cachedPlayer, odysseyPlayer);
  }
  

  // The odyssey API changed or returned unexpected player data.
  // The data now mismatches the cached player.
  // This should never happen, but if it does, we need to know about it.
  if (cachedPlayer && odysseyPlayer.playerId !== cachedPlayer.id) {
    ensureLogger.error(`Player ID mismatch!! (${odysseyPlayer.username}) CachedID: ${cachedPlayer.id}, OdysseyID: ${odysseyPlayer.playerId}`);
    
    cachedPlayer = await fixMismatch(cachedPlayer, odysseyPlayer);

    if (cachedPlayer == null) {
      return {
        data: {},
        status: 500,
        message: "Player ID mismatch. Please notify administrators.",
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
  const playerMastery = await prometheusService.mastery.player(odysseyPlayer.playerId || cachedPlayer?.id)
  const updateParams: UpdateRequirements = {
    cachedPlayer,
    playerMastery,
    ensuredRegion,
    isGhostProfile,
  }

  const ignoreUpdates = shouldUpdateUser(updateParams);

  // Player has not played the game since their last update.
  if (ignoreUpdates) {
    ensureLogger.info(`Player Stats haven't changed since last update. Returning partially cached player.`);

    return {
      data: cachedPlayer,
      status: 200,
      ok: true
    };
  }

  // AKA, (ignoreUpdates) is FALSE, and we need to update them now.
  // Can use odysseyPlayer as much as you want now. (Depending on context)
  // Also cachedPlayer definitely exists (by this point) and matches odysseyPlayer.

  if (odysseyPlayer.platformIds.discord) {
    await checkDiscord(odysseyPlayer, odysseyPlayer.platformIds.discord.discordId);
  }
  
  ensureLogger.info(`Updating profile of '${decodedUser}'...`);
    
  // namehistory function

  const basicUpdate = await prisma.player.update({
    where: {
      id: cachedPlayer.id,
    },
    data: {
      currentXp: playerMastery.currentLevelXp,
      emoticonId: odysseyPlayer.emoticonId,
      logoId: odysseyPlayer.logoId,
      titleId: odysseyPlayer.titleId,
      nameplateId: odysseyPlayer.nameplateId,
      socialUrl: odysseyPlayer.socialUrl,
      tags: odysseyPlayer.tags,
    },
  })

  await checkUpdatePlayer({cachedPlayer, ensuredRegion, mastery: playerMastery});

  // advanced stats (beginning)
  // Only runs if it needs to update.
  if (!ignoreUpdates) {
    const playerStats = await prometheusService.stats.player(odysseyPlayer.playerId)
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
    
      await prisma.player.update({
        data: {
          tags: odysseyPlayer.tags,
          username: odysseyPlayer.username,
          emoticonId: odysseyPlayer.emoticonId,
          nameplateId: odysseyPlayer.nameplateId,
          socialUrl: odysseyPlayer.socialUrl,
          logoId: odysseyPlayer.logoId,
          region: ensuredRegion?.region || 'Global',
          titleId: odysseyPlayer.titleId,
          updatedAt: dayjs().toISOString(),
        },
        where: {
          id: odysseyPlayer.playerId,
        },
      });

      const fullyUpdated = await fetchCachedPlayer(odysseyPlayer.username);

      return {
        data: fullyUpdated,
        status: 200,
        ok: true
      };
    }
  }
  
  // Return partial updates since player does not need full updating
  return {
    data: { ...basicUpdate, teams: cachedPlayer.teams },
    status: 200,
    ok: true
  };
};