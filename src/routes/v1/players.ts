import { getTypeOfInput } from '../../core/utils';
import { appLogger } from '../../plugins/logger';
import { FastifyPluginAsync } from 'fastify';
import { searchByID } from '../../core/players/idSearch';
import { usernameSearch, UserResponse } from '../../core/players/userSearch';
import { CorestrikePlayer, PlayerObjectType, regions } from '../../types/players';
import { getRankFromLP } from '../../core/ranks';
import { fetchCharacters } from '../../core/tools/characters';
import { Team } from '../../types/teams';
import { prisma } from '../../plugins/prisma';

const ensureLogger = appLogger('PlayerRoute/v1')

type CharacterData = {
  name: string;
  display_name: string | undefined,
  wins: number,
  losses: number,
  assists: number,
  mvp: number,
  knockouts: number,
  scores: number,
  saves: number,
  totalGames?: number;
  winrate?: number | null;
};

// Users must have a valid JWT to use this endpoint.
// I hate doing this but we cannot gamble someone abusing it.
// (If we get rate limited it could shutdown CC)
const players: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:input', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { input } = req.params as { input: string };
    let { region, cached } = req.query as { region?: string; cached?: boolean };
    const inType = getTypeOfInput(input);
    let response: UserResponse;

    if (region && (!regions.includes(region))) { region = 'Global' };

    if (inType == 'id') {
      ensureLogger.info(`User is searching with ID, passing off to ID-Search...`);
      response = await searchByID(input, req, region, cached);
    } else {
      response = await usernameSearch(input, req, region, cached);
    }

    if (!response.ok) { return reply.status(response.status).send({ error: response.message }) };

    // Parse data to Corestrike Model:
    try {
      const player: PlayerObjectType = response.data;
      const mostRecentRating = player.ratings[0];
      const rank = getRankFromLP(mostRecentRating.rating);

      const parsedPilotInformation = {
        characterRatings: [
          { 
            assists: 0,
            character: 'TD_DefaultStriker',
            createdAt: new Date().toISOString(),
            gamemode: 'RankedInitial',
            games: 0,
            knockouts: 0,
            losses: 0,
            mvp: 0,
            role: 'forward',
            saves: 0,
            scores: 0,
            winrate: 0,
            wins: 0
          }
        ],
        rankedData: {
          wins: 0,
          losses: 0
        },
        gamemodeRatings: {
          forward: {
            assists: 0,
            knockouts: 0,
            saves: 0,
            scores: 0,
            mvp: 0,
            games: 0,
            wins: 0,
            losses: 0,
            winrate: 0, 
          },
          goalie: {
            assists: 0,
            knockouts: 0,
            saves: 0,
            scores: 0,
            mvp: 0,
            games: 0,
            wins: 0,
            losses: 0,
            winrate: 0,
          },
          gamemode: 'RankedInitial',
        },
      }

      player.characterRatings.forEach((rating: any) => {

        // If we already processed this character rating on this gamemode & role, skip it
        if ( parsedPilotInformation.characterRatings.find(cr => cr.character === rating.character && cr.role === rating.role.toLowerCase()) ) { return }
        
        // Gamemode is ranked, save wins and losses for later
        if (rating.gamemode === 'RankedInitial') {
            parsedPilotInformation.rankedData.wins += rating.wins
            parsedPilotInformation.rankedData.losses += rating.losses
        }
        
        parsedPilotInformation.gamemodeRatings[rating.role === 'Forward' ? 'forward' : 'goalie'].games += rating.games
        parsedPilotInformation.gamemodeRatings[rating.role === 'Forward' ? 'forward' : 'goalie'].wins += rating.wins
        parsedPilotInformation.gamemodeRatings[rating.role === 'Forward' ? 'forward' : 'goalie'].losses += rating.losses
        parsedPilotInformation.gamemodeRatings[rating.role === 'Forward' ? 'forward' : 'goalie'].scores += rating.scores
        parsedPilotInformation.gamemodeRatings[rating.role === 'Forward' ? 'forward' : 'goalie'].assists += rating.assists
        parsedPilotInformation.gamemodeRatings[rating.role === 'Forward' ? 'forward' : 'goalie'].saves += rating.saves
        parsedPilotInformation.gamemodeRatings[rating.role === 'Forward' ? 'forward' : 'goalie'].knockouts += rating.knockouts
        parsedPilotInformation.gamemodeRatings[rating.role === 'Forward' ? 'forward' : 'goalie'].mvp += rating.mvp
    
    
        parsedPilotInformation.characterRatings.push({
            character: rating.character,
            assists: rating.assists,
            knockouts: rating.knockouts,
            wins: rating.wins,
            losses: rating.losses,
            mvp: rating.mvp,
            saves: rating.saves,
            scores: rating.scores,
            games: rating.games,
            winrate: rating.wins / rating.games * 100,
            createdAt: rating.createdAt,
            role: rating.role === 'Forward' ? 'forward' : 'goalie',
            gamemode: rating.gamemode
        })
      })

      const gamesAsForward = parsedPilotInformation.gamemodeRatings.forward.games || 0
      const gamesAsGoalie = parsedPilotInformation.gamemodeRatings.goalie.games || 0
      const forwardRatio = gamesAsForward / (gamesAsForward + gamesAsGoalie) * 100

      // Transform the ratings data into the lp_history format
      const lp_history: [number, number][] = player.ratings
      .filter((rating) => rating.rating !== 0)
      .map((rating): [number, number] => [
        new Date(rating.createdAt).getTime(),
        rating.rating,
      ]);

      // Fetch all characters now, then find a specific one later (not async)
      const characterIndex = await fetchCharacters();

      const overallStats = player.characterRatings
        .filter((character: any) => character.gamemode === 'RankedInitial') // Filter characters by gamemode
        .reduce((acc: { forwards: CharacterData, goalies: CharacterData }, character: any) => {
          const role = character.role === 'Forward' ? 'forwards' : 'goalies';

          // Initialize the stats object if it doesn't exist
          if (!acc[role]) {
            acc[role] = {
              name: role === 'forwards' ? 'Forwards' : 'Goalies',
              display_name: 'Unknown',
              wins: 0,
              losses: 0,
              assists: 0,
              mvp: 0,
              knockouts: 0,
              scores: 0,
              saves: 0,
            };
          }

          // Aggregate the stats
          acc[role].wins += character.wins;
          acc[role].losses += character.losses;
          acc[role].assists += character.assists;
          acc[role].mvp += character.mvp;
          acc[role].knockouts += character.knockouts;
          acc[role].scores += character.scores;
          acc[role].saves += character.saves;

          return acc;
        }, {
          forwards: {
            name: 'Forwards',
            display_name: 'Unknown',
            wins: 0,
            losses: 0,
            assists: 0,
            mvp: 0,
            knockouts: 0,
            scores: 0,
            saves: 0,
          },
          goalies: {
            name: 'Goalies',
            display_name: 'Unknown',
            wins: 0,
            losses: 0,
            assists: 0,
            mvp: 0,
            knockouts: 0,
            scores: 0,
            saves: 0,
          },
        });

      const fetchedTeams = await prisma.player.findFirst({
        where: { username: player.username },
        include: {
          teams: {
            include: { team: true }
          }
        }
      })

      const teams: Team[] = fetchedTeams?.teams.map(tp => ({
        teamName: tp.team.teamName,
        teamTag: tp.team.teamTag,
        series: tp.team.series,
        season: tp.team.season,
        logo: tp.team.logo,
      }));

      const finalData: CorestrikePlayer = {
        rankedStats: {
          username: player.username,
          rating: mostRecentRating.rating,
          rating_display: rank.rankObject.name,
          rank: mostRecentRating.rank, // Like ranking. e.g. #1 Global
          role: forwardRatio > 59.9 ? 'Forward' : forwardRatio < 40.1 ? 'Goalie' : 'Flex',
          wins: mostRecentRating.wins,
          losses: mostRecentRating.losses,
          winpercent: `${(mostRecentRating.wins / mostRecentRating.games * 100).toFixed(1)}%`,
          toppercent: `${(( mostRecentRating.rank / 10000 ) * 100).toFixed(1)}%`,
          is_ranked: true,
          masteryLevel: player.mastery.currentLevel,
          playerStatus: player.playerStatus, // just in case :(
          lp_history
        },
        characterStats: player.characterRatings
          .filter((character: any) => character.gamemode === 'RankedInitial') // Filter characters by gamemode
          .reduce((acc: { forwards: CharacterData[], goalies: CharacterData[] }, character: any) => {
            const charObj = characterIndex.find( char => char.id === character.character)
            const characterData: CharacterData = {
              name: character.character,
              display_name: charObj.name,
              wins: character.wins,
              losses: character.losses,
              assists: character.assists,
              mvp: character.mvp,
              knockouts: character.knockouts,
              scores: character.scores,
              saves: character.saves,
            };

            if (character.role === 'Forward') {
              acc.forwards.push(characterData);
            } else if (character.role === 'Goalie') {
              acc.goalies.push(characterData);
            }

          return acc;
        }, { forwards: [], goalies: [] }), // Initialize with empty arrays for forwards and goalies
        overallStats,
        teams,
        lastUpdated: player.updatedAt
      };

      return reply.status(response.status).send(finalData);

    } catch (error) {
      ensureLogger.error(`Something went wrong in FETCH PLAYER V1:`, error);
      return reply.status(500).send({ error: "Something went wrong. Please contact Server Administrator." });
    }
  });
};

export default players;