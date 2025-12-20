import axios, { AxiosInstance, AxiosError } from 'axios'
import { PROMETHEUS } from '../types/prometheus'
import { appLogger } from '../plugins/logger'
import steamRefresh from './cronjobs/steam'
import { BrowseCustomLobbies, PrometheusCustomLobbySearchBody } from '../types/customs'

const logger = appLogger('Prometheus')

// RAM token storage
let tokenStore = {
  token: '',
  refresh: ''
}

let refreshPromise: Promise<void> | null = null

// Create axios client with interceptors
function createClient(): AxiosInstance {
  const client = axios.create({ baseURL: process.env.ODYSSEY_URL })

  if (process.env.MODE == "DEVELOPMENT" && process.env.FORCE_JWT && process.env.FORCE_REFRESH) {
    logger.warn('FORCE_JWT & FORCE_REFRESH Set! Using tokens from .env...');
    tokenStore.token = process.env.FORCE_JWT,
    tokenStore.refresh = process.env.FORCE_REFRESH
  }

  // Request interceptor
  client.interceptors.request.use(cfg => {
    cfg.headers['X-Authorization'] = `Bearer ${tokenStore.token}`
    cfg.headers['X-Refresh-Token'] = tokenStore.refresh
    return cfg
  })

  // Response interceptor
  client.interceptors.response.use(
    res => res,
    async (err: AxiosError) => {
      if ([401, 403].includes(err?.response?.status ?? 0)) {
        await refreshTokens(client)
        return client.request(err.config!)
      }
      return Promise.reject(err)
    }
  )

  return client
}

// Refresh tokens
async function refreshTokens(client: AxiosInstance) {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    logger.info('Refreshing Prometheus tokens...')
    const { jwt, refreshToken } = await steamRefresh();
    tokenStore.token = jwt
    tokenStore.refresh = refreshToken
    logger.info('Tokens refreshed & stored in memory')
  })()

  await refreshPromise
  refreshPromise = null
}

const client = createClient()

// Content API

/**
 * Fetch all available power-ups from the content API
 * @returns List of power-ups with their properties
 */
export async function fetchContentPowerUps() {
  return (await client.get<PROMETHEUS.API.CONTENT.PowerUps>('/v1/content/power-ups')).data
}

/**
 * Fetch all available emoticons from the content API
 * @returns List of emoticons with their properties
 */
export async function fetchContentEmoticons() {
  return (await client.get<PROMETHEUS.API.CONTENT.Emoticons>('/v1/content/emoticons')).data
}

/**
 * Fetch all available characters from the content API
 * @returns List of characters with their properties
 */
export async function fetchContentCharacters() {
  return (await client.get<PROMETHEUS.API.CONTENT.Characters>('/v1/content/characters')).data
}

// Ranked API

/**
 * Fetch ranked leaderboard players
 * @param startRank - Starting rank position (default: 0)
 * @param pageSize - Number of players to return (default: 25)
 * @param region - Optional region filter
 * @returns Leaderboard data with player rankings
 */
export async function fetchRankedPlayers(
  startRank = 0,
  pageSize = 25,
  region?: PROMETHEUS.RAW.Regions
) {
  const { data } = await client.get<PROMETHEUS.API.RANKED.LEADERBOARD.Players>(
    '/v1/ranked/leaderboard/players',
    {
      params: {
        startRank,
        pageSize,
        specificRegion: region,
      },
    }
  )
  return data
}

/**
 * Search for a specific player on the ranked leaderboard
 * @param playerId - The player's unique ID
 * @param entriesBefore - Number of entries to include before the player (default: 0)
 * @param entriesAfter - Number of entries to include after the player (default: 0)
 * @param region - Optional region to search in
 * @returns Search results with player position and surrounding entries
 */
export async function fetchRankedPlayer(
  playerId: string,
  entriesBefore = 0,
  entriesAfter = 0,
  region?: string
) {
  const { data } = await client.get<PROMETHEUS.API.RANKED.LEADERBOARD.Search>(
    `/v1/ranked/leaderboard/search/${playerId}`,
    {
      params: {
        entriesBefore,
        entriesAfter,
        specificRegion: region === 'Global' ? undefined : region,
      },
    }
  )
  return data
}

/**
 * Fetch ranked leaderboard for friends
 * @param startRank - Starting rank position (default: 1)
 * @param pageSize - Number of players to return (default: 25)
 * @returns Leaderboard data for friends
 */
export async function fetchRankedFriends(startRank = 1, pageSize = 25) {
  const { data } = await client.get<PROMETHEUS.API.RANKED.LEADERBOARD.Players>(
    '/v1/ranked/leaderboard/friends',
    {
      params: {
        startRank,
        pageSize,
      },
    }
  )
  return data
}

/**
 * Fetch ranked leaderboard for friends including current user
 * @param startRank - Starting rank position (default: 1)
 * @param pageSize - Number of players to return (default: 25)
 * @returns Leaderboard data for friends with current user highlighted
 */
export async function fetchRankedFriendsMe(startRank = 1, pageSize = 25) {
  const { data } = await client.get<PROMETHEUS.API.RANKED.LEADERBOARD.Friends>(
    '/v1/ranked/leaderboard/friends/me',
    {
      params: {
        startRank,
        pageSize,
      },
    }
  )
  return data
}

/**
 * Fetch information about the current ranked season
 * @returns Current season details including dates and status
 */
export async function fetchRankedCurrentSeason() {
  const { data } = await client.get<PROMETHEUS.API.RANKED.LEADERBOARD.CurrentSeason>(
    '/v1/ranked/leaderboard/season/current'
  )
  return data
}

/**
 * Fetch the current user's ranked rating
 * @returns User's current rating and rank information
 */
export async function fetchRankedRating() {
  const { data } = await client.get<PROMETHEUS.API.RANKED.LEADERBOARD.Rating>(
    '/v1/ranked/leaderboard/rating'
  )
  return data
}

/**
 * Find which region a player belongs to by searching all regions
 * @param playerId - The player's unique ID
 * @param specificRegion - Optional specific region to check first
 * @returns Player data and their region, or undefined if not found
 */
export async function ensurePlayerRegion(playerId: string, specificRegion?: string) {
  logger.info('Ensuring region...')

  const regionList =
    specificRegion === 'Global'
      ? ['Global']
      : [
          specificRegion,
          'NorthAmerica',
          'SouthAmerica',
          'Europe',
          'Asia',
          'Oceania',
          'JapaneseLanguageText',
          'Global',
        ].filter(Boolean)

  for (const region of regionList) {
    try {
      logger.debug(`Checking ${region}...`)
      const { players } = await fetchRankedPlayer(
        playerId,
        0,
        0,
        region === 'Global' ? undefined : region
      )

      if (players.length > 0) {
        return { player: players[0], region }
      }
    } catch {
      continue
    }
  }
}

// Mastery API

/**
 * Fetch mastery data for a specific player
 * @param playerId - The player's unique ID
 * @param entriesBefore - Number of entries to include before current position (default: 0)
 * @param entriesAfter - Number of entries to include after current position (default: 0)
 * @returns Player mastery data with rankings
 */
export async function fetchPlayerMastery(
  playerId: string,
  entriesBefore = 0,
  entriesAfter = 0
) {
  if (playerId.includes('NOTSET')) return
  return (
    await client.get<PROMETHEUS.API.MASTERY.Player>(
      `/v1/mastery/${playerId}/player`,
      { params: { entriesAfter, entriesBefore } }
    )
  ).data
}

/**
 * Fetch character mastery data for a specific player
 * @param playerId - The player's unique ID
 * @returns Character mastery statistics for the player
 */
export async function fetchCharacterMastery(playerId: string) {
  return (
    await client.get<PROMETHEUS.API.MASTERY.Character>(
      `/v1/mastery/${playerId}/characters`
    )
  ).data
}

/**
 * Fetch character mastery data for a specific player (V2 endpoint)
 * @param playerId - The player's unique ID
 * @returns Character mastery statistics for the player (newer format)
 */
export async function fetchCharacterMasteryV2(playerId: string) {
  return (
    await client.get<PROMETHEUS.API.MASTERY.Character>(
      `/v2/mastery/${playerId}/characters`
    )
  ).data
}

// Player API

/**
 * Fetch all characters owned by a specific player
 * @param playerId - The player's unique ID
 * @returns List of characters the player owns
 */
export async function fetchPlayerCharacters(playerId: string) {
  const { data } = await client.get<PROMETHEUS.API.PLAYER.Characters>(
    `/v1/players/${playerId}/characters`
  )
  return data
}

/**
 * Fetch all emoticons owned by a specific player
 * @param playerId - The player's unique ID
 * @returns List of emoticons the player owns
 */
export async function fetchPlayerEmoticons(playerId: string) {
  const { data } = await client.get<PROMETHEUS.API.PLAYER.Emoticons>(
    `/v1/players/${playerId}/emoticons`
  )
  return data
}

/**
 * Search for a player by their username
 * @param username - The username to search for
 * @returns Matching player data, or null if not found. Prefers exact case match.
 */
export async function fetchUsernameQuery(username: string) {
  const { data } = await client.get<PROMETHEUS.API.PLAYER.UsernameQuery>(
    '/v1/players',
    {
      params: {
        usernameQuery: username,
      },
    }
  )

  if (!data.matches?.length) return null

  // If multiple matches, prefer exact casing
  let matchingPlayer
  if (data.matches.length > 1) {
    matchingPlayer = data.matches.find(
      (player) => player.username === username
    )
  }

  // Fallback to case-insensitive match if no exact casing found
  if (!matchingPlayer) {
    matchingPlayer = data.matches.find(
      (player) => player.username.toLowerCase() === username.toLowerCase()
    )
  }

  return matchingPlayer ?? null
}

// Stats API

/**
 * Fetch detailed statistics for a specific player
 * @param playerId - The player's unique ID
 * @returns Comprehensive player statistics
 */
export async function fetchPlayerStats(playerId: string) {
  return (
    await client.get<PROMETHEUS.API.STATS.Player>(
      `/v1/stats/player-stats/${playerId}`
    )
  ).data
}


/**
 * Fetch list of custom lobbies like the in game server browser
 * @param search - Owner's Name or Lobby Name
 * @param excludeFull - Don't query lobbies that are full
 * @returns List of custom lobbies matching search string
 */
export async function fetchCustomLobbies(
  search: string,
  excludeFull?: boolean,
) {
  const body: PrometheusCustomLobbySearchBody = {
    startingTimestamp: "",
    newerThanStartingTimestamp: false,
    desiredCount: 50,
    searchString: search ?? "", // search has to be there, even if blank
    onlyFriendGames: false,
    excludeFull: excludeFull ?? false,
    latencyThreshold: "10000", // all regions for now
    lobbySizes: [],
    gameOptions: {},
  }

  const { data } = await client.post<BrowseCustomLobbies>(
    `/v1/custom-lobby/browse`,
    body,
    { headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Odyssey-GameVersion': '4.2.8'
    } }
  )
  return data.lobbies;
}