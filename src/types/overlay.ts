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

type PilotBadge = {
  name: string;
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
  badges: PilotBadge[];
  masteryLevel: number;
  nextMasteryXp: number;
  currentMasteryXp: number;
  tags: string[];
  socialUrl?: string;
  teamData?: TeamDataType[];
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