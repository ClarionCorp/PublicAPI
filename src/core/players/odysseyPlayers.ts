import { appLogger } from "../../plugins/logger";
import { prisma } from '../../plugins/prisma';
import { PROMETHEUS } from '../../types/prometheus';
import { PlayerObjectType } from "../../types/players";

const odyLogger = appLogger('Players/Ody')

// Handles ensureRegion - may be removed
export async function getRegion() {

}

// Fetches data for an Odyssey Player.
// Most usernames use usernameQuery,
// Short usernames use lbQuery.
export async function fetchOdyPlayer(username?: string, cachedPlayer?: PlayerObjectType | null): Promise<PROMETHEUS.RAW.Player | null> {
  const searchName = username || cachedPlayer?.username;
  odyLogger.debug(`Searching for Player '${username}'...`);

  if (searchName) {
    if (searchName.length == 1) {
      odyLogger.warn(`Searched Username is 1 character long! Using alternative endpoints...`);
      return await handleShortNames(cachedPlayer!);
      } else {
      const userQuery = await prometheusService.player.usernameQuery(decodeURI(searchName));

      if (!userQuery) {
        odyLogger.warn(`Odyssey Query came back empty! Trying fallback method..`);
        return await tryBrokenNames(decodeURI(username!));
      }

      return userQuery;
      }
  } else { // Neither are provided.
    odyLogger.error(`Error while fetching ODYSSEY PLAYER: No search parameters received!`);
    return null;
  }
}

// Uses different endpoints for single-character usernames.
// Does not check on its own, only handles for them.
export async function handleShortNames(cachedPlayer: PlayerObjectType): Promise<PROMETHEUS.RAW.Player | null> {
  let lbData: PROMETHEUS.API.RANKED.LEADERBOARD.Search;
  // const cUsername = decodeURI(cachedPlayer.username);

  try {
    lbData = await prometheusService.ranked.leaderboard.search(cachedPlayer.id);
  } catch (error) {
    odyLogger.error(`Error while searching for SHORT USERNAME: `, error);
    return null;
  }

  if (lbData.players[0].username.toLocaleLowerCase() != cachedPlayer.username) {
    odyLogger.error(`Could not find short username's UID in database!`);
    return null
  }

  const basicData = lbData.players[0]
  const structPlayer: PROMETHEUS.RAW.Player = {
    username: cachedPlayer.username,
    playerId: basicData.playerId,
    logoId: basicData.logoId,
    title: basicData.title,
    nameplateId: basicData.nameplateId,
    emoticonId: basicData.emoticonId,
    titleId: basicData.titleId,
    tags: basicData.tags,
    platformIds: basicData.platformIds,
    masteryLevel: basicData.masteryLevel,
    playerStatus: basicData.playerStatus,
    organization: basicData.organization,
    socialUrl: basicData.socialUrl,
  }

  return structPlayer;
}


// Uses different endpoints for weird usernames.
// Does do its own checking, sorta. Use this in errors when normal fails.
export async function tryBrokenNames(username: string): Promise<PROMETHEUS.RAW.Player | null> {
  let lbData: PROMETHEUS.API.RANKED.LEADERBOARD.Search;

  const findCache = await prisma.player.findFirst({
    where: { username: username }
  });

  if (!findCache) {
    odyLogger.error(`Unable to find PLAYER '${username}'`);
    return null;
  }

  try {
    lbData = await prometheusService.ranked.leaderboard.search(findCache.id);
  } catch (error) {
    odyLogger.error(`Error while searching for SHORT USERNAME: `, error);
    return null;
  }

  if (lbData.players[0].username.toLocaleLowerCase() != username) {
    odyLogger.error(`Could not find broken username's UID in database!`);
    return null
  }

  const basicData = lbData.players[0]
  const structPlayer: PROMETHEUS.RAW.Player = {
    username: username,
    playerId: basicData.playerId,
    logoId: basicData.logoId,
    title: basicData.title,
    nameplateId: basicData.nameplateId,
    emoticonId: basicData.emoticonId,
    titleId: basicData.titleId,
    tags: basicData.tags,
    platformIds: basicData.platformIds,
    masteryLevel: basicData.masteryLevel,
    playerStatus: basicData.playerStatus,
    organization: basicData.organization,
    socialUrl: basicData.socialUrl,
  }

  return structPlayer;
}