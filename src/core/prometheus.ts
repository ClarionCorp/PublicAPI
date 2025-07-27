import axios, { AxiosInstance } from 'axios'
import { PROMETHEUS } from '../types/prometheus'
import { appLogger } from '../plugins/logger'

type TokenStore = {
  token: string
  refresh: string
  save: (v: { token: string; refresh: string }) => Promise<void>
}

export class PrometheusService {
  private readonly log = appLogger('Prometheus')
  private readonly client: AxiosInstance
  private token: string
  private refresh: string
  private readonly save: TokenStore['save']
  private refreshing: Promise<void> | null = null;

  constructor ({ token, refresh, save }: TokenStore) {
    this.token = token
    this.refresh = refresh
    this.save = save

    this.client = axios.create({ baseURL: process.env.ODYSSEY_URL })

    /* request interceptor */
    this.client.interceptors.request.use(cfg => {
      cfg.headers['X-Authorization'] = `Bearer ${this.token}`
      cfg.headers['X-Refresh-Token'] = this.refresh
      return cfg
    })

    /* response interceptor */
    this.client.interceptors.response.use(
      res => res,
      async err => {
        if ([401, 403].includes(err?.response?.status)) {
          await this.refreshTokens()
          return this.client.request(err.config)
        }
        return Promise.reject(err)
      },
    )
  }

  /** Gets a fresh pair of tokens and persists them with this.save() */
  private async refreshTokens() {
    if (this.refreshing) return this.refreshing;

    this.refreshing = (async () => {
      this.log.debug('Refreshing Prometheus tokens…');
      const { data } = await this.client.post<PROMETHEUS.API.LOGIN.Token>('/v1/login/token');
      this.token = data.jwt;
      this.refresh = data.refreshToken;
      await this.save({ token: this.token, refresh: this.refresh });
      this.log.debug('Tokens refreshed & saved to DB');
    })();

    await this.refreshing;
    this.refreshing = null;
  }


  public content = {
    powerUps  : async () =>
      (await this.client.get<PROMETHEUS.API.CONTENT.PowerUps>(
        '/v1/content/power-ups',
      )).data,

    emoticons : async () =>
      (await this.client.get<PROMETHEUS.API.CONTENT.Emoticons>(
        '/v1/content/emoticons',
      )).data,

    characters: async () =>
      (await this.client.get<PROMETHEUS.API.CONTENT.Characters>(
        '/v1/content/characters',
      )).data,
  }

  public ranked = {
    leaderboard: {
      players: async (
        startRank = 0,
        pageSize = 25,
        region?: PROMETHEUS.RAW.Regions,
      ) => {
        const { data } =
          await this.client.get<PROMETHEUS.API.RANKED.LEADERBOARD.Players>(
            '/v1/ranked/leaderboard/players',
            {
              params: {
                startRank,
                pageSize,
                specificRegion: region,
              },
            },
          )

        return data
      },

      search: async (
        playerId: string,
        entriesBefore = 0,
        entriesAfter = 0,
        region?: string,
      ) => {
        const { data } =
          await this.client.get<PROMETHEUS.API.RANKED.LEADERBOARD.Search>(
            `/v1/ranked/leaderboard/search/${playerId}`,
            {
              params: {
                entriesBefore,
                entriesAfter,
                specificRegion: region === 'Global' ? undefined : region,
              },
            },
          )

        return data
      },

      friends: async (startRank = 1, pageSize = 25) => {
        const { data } =
          await this.client.get<PROMETHEUS.API.RANKED.LEADERBOARD.Players>(
            '/v1/ranked/leaderboard/friends',
            {
              params: {
                startRank,
                pageSize,
              },
            },
          )

        return data
      },

      friendsMe: async (startRank = 1, pageSize = 25) => {
        const { data } =
          await this.client.get<PROMETHEUS.API.RANKED.LEADERBOARD.Friends>(
            '/v1/ranked/leaderboard/friends/me',
            {
              params: {
                startRank,
                pageSize,
              },
            },
          )

        return data
      },

      season: {
        current: async () => {
          const { data } =
            await this.client.get<PROMETHEUS.API.RANKED.LEADERBOARD.CurrentSeason>(
              '/v1/ranked/leaderboard/season/current',
            )

          return data
        },
      },

      rating: async () => {
        const { data } =
          await this.client.get<PROMETHEUS.API.RANKED.LEADERBOARD.Rating>(
            '/v1/ranked/leaderboard/rating',
          )

        return data
      },

      ensureRegion: async (playerId: string, specificRegion?: string) => {
        this.log.info('Ensuring region...')
        for (const region of [
          ...(specificRegion === 'Global' || !specificRegion
            ? [
                'Global',
                'NorthAmerica',
                'SouthAmerica',
                'Europe',
                'Asia',
                'Oceania',
                'JapaneseLanguageText',
                undefined,
              ]
            : [specificRegion]),
        ]) {
          if (!region) {
            return
          }
          try {
            this.log.debug(`Checking ${region}...`)
            const { players } = await this.ranked.leaderboard.search(
              playerId,
              0,
              0,
              region === 'Global' ? undefined : region,
            )
            // If you are below 100 in global, you are most likely wanting to see your regional first.
            if (region === 'Global' && players[0].rank > 100) {
              // this.log.warn('Not what the user expects')
              continue
            }

            if (players.length > 0) {
              return { player: players[0], region: region }
            }
          } catch {
            continue
          }
        }
      },
    },
  }

  public mastery = {
    player: async (
      playerId: string,
      entriesBefore = 0,
      entriesAfter  = 0,
    ) => {
      if (playerId.includes('NOTSET')) return
      return (
        await this.client.get<PROMETHEUS.API.MASTERY.Player>(
          `/v1/mastery/${playerId}/player`,
          { params: { entriesAfter, entriesBefore } },
        )
      ).data
    },

    character: async (playerId: string) => {
      return (
        await this.client.get<PROMETHEUS.API.MASTERY.Character>(
          `/v1/mastery/${playerId}/characters`,
        )
      ).data
    },

    characterV2: async (playerId: string) => {
      return (
        await this.client.get<PROMETHEUS.API.MASTERY.Character>(
          `/v2/mastery/${playerId}/characters`,
        )
      ).data
    },
  }

  public player = {
    chracters: async (playerId: string) => {
      const { data } = await this.client.get<PROMETHEUS.API.PLAYER.Characters>(
        `/v1/players/${playerId}/characters`,
      )

      return data
    },

    emoticons: async (playerId: string) => {
      const { data } = await this.client.get<PROMETHEUS.API.PLAYER.Emoticons>(
        `/v1/players/${playerId}/emoticons`,
      )

      return data
    },

    usernameQuery: async (
      username: string
    ) => {
      const { data } =
        await this.client.get<PROMETHEUS.API.PLAYER.UsernameQuery>(
          '/v1/players',
          {
            params: {
              usernameQuery: username
            },
          },
        )

      const matchingPlayer = data.matches.find(
        (player) => player.username.toLowerCase() === username.toLowerCase(),
      )

      return matchingPlayer
    },
  }

  public stats = {
    player: async (playerId: string) =>
      (await this.client.get<PROMETHEUS.API.STATS.Player>(
        `/v1/stats/player-stats/${playerId}`,
      )).data,
  }
}