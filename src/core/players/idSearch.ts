import { fetchCachedPlayer } from "./misc";
import { appLogger } from '../../plugins/logger';
import { sendToAnalytics } from "../analytics";
import { FastifyRequest } from "fastify";
import { usernameSearch, UserResponse } from "./userSearch";

const idLogger = appLogger('ID-Search')

export async function searchByID(playerId: string, req?: FastifyRequest, region?: string, cached?: boolean): Promise<UserResponse> {
  idLogger.debug(`Searching locally for ID '${playerId}'...`);
  let cachedPlayer = undefined;
  let username: string;
  cachedPlayer = await fetchCachedPlayer(undefined, playerId);

  // console.log(JSON.stringify(cachedPlayer, null, 1))

  if (!cachedPlayer && cachedPlayer !== undefined && cachedPlayer !== null) { 
    idLogger.debug(`Found Cached Data for: '${decodeURI(cachedPlayer.username)}' with ${cachedPlayer.ratings?.length} rating points.`);
  
    // If cached argument is true, return HERE.
    if (cached && cachedPlayer) {
      idLogger.info('Cached Player Requested. Returning cached data...');
      await sendToAnalytics('V2_PLAYERS_CACHED', req.ip, req.user!.id, `${cachedPlayer.username}`);
      return {
        data: { ...cachedPlayer, ratings: cachedPlayer.ratings, },
        status: 200,
        ok: true
      }
    }

    username = cachedPlayer.username;
  } else { 
    idLogger.warn(`Failed to find cached data for: '${playerId}'. Continuing...`);
    const lbData = await prometheusService.ranked.leaderboard.search(playerId);
    const basicData = lbData.players[0]
    username = basicData.username;
  }
  
  // By this point, we should have the player's username.
  // If not, return null as the player does not exist.
  if (!username) { return null }

  // Now we fetch the standard endpoint again.
  // In the future, this should probably just be a function or something lol.
  // const response = await fetch(`${process.env.API_BASE_URL ?? 'https://api.clarioncorp.net'}/v2/players/${username}`, { method: 'GET', headers: { 'Authorization': req.headers.authorization } });
  const response = await usernameSearch(username, req, region, cached);

  return {
    data: response.data,
    status: response.status,
    ok: response.ok
  }
}