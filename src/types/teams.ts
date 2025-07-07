export enum Series {
  EUSL_S1 = 'EUSL S1',
  EUSL_S2 = 'EUSL S2',
  NASL_S4 = 'NASL S4',
  NAST_S4 = 'NAST S4',
  NASA_S4 = 'NASA S4',
}

export type Team = {
  teamId: string;
  teamName: string;
  logo: string;
  series?: string;
}

// Represents a player's teams
export type PlayerEntry = {
  username: string;
  teams: Team[];
}

// Root response containing all players and their teams
export type PlayersResponse = {
  players: PlayerEntry[];
}

export type PlayerWithTeams = {
  username: string;
  teams: Team[];
}