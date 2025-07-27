import { TeamPlayers } from "./teams";

// Based on Query
export type TrackedPlayersStructure = {
  username: string;
  userId: string;
  startedAt: Date;
  ratings: TempRatings[];
}

// Based on Query
export type TempRatings = {
  rating: number;
  loggedAt: Date;
}

export type RoleData = {
  games: number,
  wins: number,
  losses: number,
  scores: number,
  assists: number,
  saves: number,
  knockouts: number,
  mvp: number,
  winrate: number,
}

export type PilotBadge = {
  forwardStats: RoleData,
  goalieStats: RoleData,
  position: 'FORWARD' | 'GOALIE' | 'FLEX',
  mostPlayedCharacter?: string,
}

export type TeamDataType = {
  teamName: string;
  teamId: string;
  logo: string;
  series: string;
}


export type PilotDataType = {
  username: string;
  title: string;
  emoticon: string;
  badgeData: PilotBadge;
  masteryLevel: number;
  nextMasteryXp: number;
  currentMasteryXp: number;
  tags: string[];
  socialUrl?: string;
  teamData?: TeamPlayers[];
  playerStatus: string;
}

export type RankDataType = {
  rank: number;
  rating: number;
  region: string;
  wins: number;
  losses: number;
  key: number;
  peakRating: number;
}

// Based on Query
export type OverlayType = {
  pilotData: PilotDataType;
  rankCard: RankDataType;
}