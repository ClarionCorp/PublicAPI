import { PlayerWithTeams, Team } from '../types/teams';
import { prisma } from './prisma';
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    teamsService: TeamsService
  }
}

export class TeamsService {
  async getTeamsInSeason(gameSeason: string): Promise<Team[]> {
    const teams = await prisma.esportsTeams.findMany({
      where: {
        players: {
          some: { gameSeason },
        },
      },
      select: {
        teamId: true,
        teamName: true,
        logo: true,
      },
    });

    return teams;
  }

  async getPlayersInTeam(teamId: string): Promise<PlayerWithTeams[]> {
    const players = await prisma.esportsTeamsOnPlayers.findMany({
      where: { teamId },
      include: {
        player: true, // Fetch player details
        team: true,   // Fetch team details
      },
    });
  
    const groupedPlayers = players.reduce((acc, entry) => {
      const { username } = entry.player;
      let playerEntry = acc.find(p => p.username === username);
      if (!playerEntry) {
        playerEntry = { username, teams: [] };
        acc.push(playerEntry);
      }
  
      playerEntry.teams.push({
        teamId: entry.teamId,
        teamName: entry.team.teamName,
        logo: entry.team.logo,
        series: entry.series || null, // Map `series` explicitly
      });
  
      return acc;
    }, [] as PlayerWithTeams[]);
  
    return groupedPlayers;
  }

  async getTeamsForPlayers(usernames: string[], gameSeason: string): Promise<PlayerWithTeams[]> {
    const players = await prisma.esportsTeamsOnPlayers.findMany({
      where: {
        username: {
          in: usernames,
          mode: 'insensitive',
        },
        ...(gameSeason && { gameSeason }), // Include `gameSeason` filter only if it's provided
      },
      include: {
        team: {
          select: {
            teamId: true,
            teamName: true,
            logo: true,
          },
        },
      },
    });
  
    const groupedPlayers = usernames.map(username => {
      const userTeams = players
        .filter(p => p.username === username)
        .map(entry => ({
          teamId: entry.team.teamId,
          teamName: entry.team.teamName,
          logo: entry.team.logo,
          series: entry.series || null, // Ensure series is mapped
        }));
      return { username, teams: userTeams };
    });
  
    return groupedPlayers;
  }
  

  async getTeamsForPlayer(username: string): Promise<Team[]> {
    const teams = await prisma.esportsTeamsOnPlayers.findMany({
      where: {
        username: {
          equals: username,
          mode: 'insensitive',
        },
      },
      include: {
        team: {
          select: {
            teamId: true,
            teamName: true,
            logo: true,
          },
        },
      },
    });
  
    return teams.map(entry => ({
      teamId: entry.team.teamId,
      teamName: entry.team.teamName,
      logo: entry.team.logo,
      series: entry.series || null, // Include `series` explicitly
    }));
  }

  async getTeamsInSeries(series: string): Promise<Team[]> {
    const teams = await prisma.esportsTeams.findMany({
      where: {
        players: {
          some: { series }, // Filter by series in the relation
        },
      },
      select: {
        teamId: true,
        teamName: true,
        logo: true,
      },
    });
  
    return teams.map(team => ({
      teamId: team.teamId,
      teamName: team.teamName,
      logo: team.logo,
      series, // Pass the series value directly
    }));
  }  
}

const teamsPlugin: FastifyPluginAsync = async (fastify) => {
  const instance =
    globalThis.teamsService ?? new TeamsService()

  globalThis.teamsService = instance
  fastify.decorate('teamsService', instance)
  fastify.log.info('[+] Teams service initialised')
}

export default fp(teamsPlugin, { name: 'teamsService' })