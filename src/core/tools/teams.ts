import { Team } from "@/types/teams";
import { EsportsPlayers, EsportsTeams } from "../../../prisma/client";

export type ExpandedTeam = EsportsPlayers & {
  team: EsportsTeams;
};

export function buildTeamsForPlayer(teams: ExpandedTeam[]): Team[] {
  const built: Team[] = teams.map(tp => ({
    teamName: tp.teamName,
    teamTag: tp.team.teamTag,
    series: tp.series,
    season: tp.season,
    logo: tp.team.logo,
  }));

  return built;
}