import { Role } from "../../prisma/client"
import { Team, TeamPlayers } from "./teams"

export type OurRegions =
  | 'Global'
  | 'NorthAmerica'
  | 'Europe'
  | 'Asia'
  | 'SouthAmerica'
  | 'Oceania'
  | 'JapaneseLanguageText'

export type PlayerMasteryObjectType = {
  createdAt: string
  playerId: string
  currentLevel: number
  currentLevelXp: number
  xpToNextLevel: number
  totalXp: number
}

export type PlayerCharacterMasteryItemObjectType = {
  characterAssetName: string
  totalXp: number
  maxTier: number
  idxHighestTierCollected: number
  currentTier: number
  currentTierXp: number
  xpToNextTier: number
}

export type PlayerCharacterMasteryObjectType = {
  createdAt: string
  playerId: string
  characterMasteries: PlayerCharacterMasteryItemObjectType[]
}

export type PlayerObjectType = {
  id: string
  username: string
  ratings?: PlayerRatingObjectType[]
  characterRatings?: PlayerCharacterRatingObjectType[]
  logoId?: string | null
  nameplateId?: string | null
  emoticonId?: string | null
  titleId?: string | null
  createdAt?: Date | null
  updatedAt?: Date | null
  region: string
  mastery?: PlayerMasteryObjectType
  tags?: string[]
  characterMastery?: PlayerCharacterMasteryObjectType
  playerStatus: string
  teams?: TeamPlayers[];
  socialUrl?: string | null
  discordId?: string | null
  currentXp?: number
}

export type PlayerLeaderboardType = {
  username: string
  playerId: string
  logoId?: string | null
  title?: string | null
  nameplateId?: string | null
  emoticonId?: string | null
  titleId?: string | null
  tags: string[]
  platformIds: {
    discord?: {
      discordId?: string | null
      hasFullAccount?: boolean
    }
  }
  masteryLevel: number
  // not including organization cos its useless
  rank: number, // 10001 if not ranked
  wins: number,
  losses: number,
  games: number,
  topRole: 'Forward' | 'Goalie',
  rating: number,
  mostPlayedCharacters?: {
    characterId: string,
    gamesPlayed: number
  }[]
  currentDivisionId: string
  progressToNext: number
}

export type PlayerRatingObjectType = {
  id: number
  playerId: string
  rating: number
  masteryLevel: number
  games: number
  rank: number
  wins: number
  losses: number
  createdAt?: Date
}

export type PilotAutocompleteObjectType = {
  username: string
  emoticonId: string
  region: string
  tags: string[]
}

export type PlayerCharacterRatingObjectType = {
  id: number
  playerId: string
  // player: PlayerObjectType
  character: string
  role: Role
  games: number
  assists: number
  knockouts: number
  losses: number
  mvp: number
  saves: number
  scores: number
  wins: number
  gamemode: string
  createdAt: Date
}

export type PlayerInputType = {
  userId?: string
  username: string
  ratings: PlayerCharacterRatingInputType[]
  logoId?: string
  nameplareId?: string
  emoticonId?: string
  titleId?: string
  nameplateId?: string
}

export type PlayerRatingInputType = {
  playerId: string
  rating: number
  games: number
  rank: number
  wins: number
  losses: number
  masteryLevel: number
}

export type PlayerCharacterRatingInputType = {
  playerId: string
  character: string
  role: 'Forward' | 'Goalie'
  games: number
  assists: number
  knockouts: number
  losses: number
  mvp: number
  saves: number
  scores: number
  wins: number
  gamemode: string
}