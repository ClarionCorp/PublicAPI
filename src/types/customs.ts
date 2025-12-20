// .../v1/custom-lobby/browse
export type BrowseCustomLobbies = {
  timestamp: Date,
  oldestTimestampInRange: Date,
  newestTimestampInRange: Date,
  moreAvailable: boolean,
  lobbies: BrowseCustomLobby[]
}

export type BrowseCustomLobby = {
  lobbyId: string,
  lobbyName: string,
  ownerUsername: string,
  ownerPlayerId: string,
  currentPlatform: 'Steam' | 'Xbox' | 'NintendoSwitch' | 'Playstation', // i have no idea what the others are but its not important rn
  platformIds: {
    discord?: {
      discordId: string,
      hasFullAccount: boolean
    }
  },
  numPlayers: number,
  numSpectators: number,
  lobbySize: number,
  spectatorsAllowed: boolean,
  requiresJoinCode: boolean, // a.k.a. "isPrivate"
  serverRegion: string, // e.g. "us-east-2"
  createdTimestamp: Date,
  gameOptions: {
    gameFormatId: string,
    mapAssetName: string,
    terrainAssetName: string,
    modifierAssetName: string,
  }
}

export type PrometheusCustomLobbySearchBody = {
  startingTimestamp: string,
  newerThanStartingTimestamp: boolean,
  desiredCount: number,
  searchString: string,
  onlyFriendGames: boolean,
  excludeFull: boolean,
  latencyThreshold: string,
  lobbySizes: any[],
  gameOptions: any, // idk what these are
}