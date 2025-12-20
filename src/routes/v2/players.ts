import { getTypeOfInput } from '../../core/utils';
import { appLogger } from '../../plugins/logger';
import { FastifyPluginAsync } from 'fastify';
import { searchByID } from '../../core/players/idSearch';
import { usernameSearch } from '../../core/players/userSearch';
import { regions } from '../../types/players';
import { calculatePlaystyle } from '../../core/players/misc';
import { prisma } from '../../plugins/prisma';
import { fetchCharacterMastery, fetchPlayerMastery } from '../../core/prometheus';

const ensureLogger = appLogger('PlayerRoute/v2')

// Users must have a valid JWT to use this endpoint.
// I hate doing this but we cannot gamble someone abusing it.
// (If we get rate limited it could shutdown CC)
const players: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:input', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { input } = req.params as { input: string };
    let { region, cached } = req.query as { region?: string; cached?: boolean };
    const inType = getTypeOfInput(input);

    if (region && (!regions.includes(region))) { region = 'Global' };

    try {
      if (inType == 'id') {
        ensureLogger.info(`User is searching with ID, passing off to ID-Search...`);
        const response = await searchByID(input, req, region, cached);
        return reply.status(response.status).send(response.ok ? response.data : { error: response.message });
      } else {
        const response = await usernameSearch(input, req, region, cached);
  
        return reply.status(response.status).send(response.ok ? response.data : { error: response.message });
      }
    } catch (error) {
      // ensureLogger.error(`Error while FETCHING PLAYER: `, error);
      return reply.status(500).send({ error });
    }
  });

  // Pretty primitive, but gets the job done for now.
  // I don't want to include it in the one above by default cos it adds an extra 300ms on ALL searches.
  fastify.get('/:id/mastery/characters', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const charMastery = await fetchCharacterMastery(id);

    if (!charMastery) { return reply.status(404).send({ error: "The specified player could not be found" }) };

    return reply.status(200).send(charMastery);
  });

  // Comments apply to this one too.
  fastify.get('/:id/mastery', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const playerMastery = await fetchPlayerMastery(id);

    if (!playerMastery) { return reply.status(404).send({ error: "The specified player could not be found" }) };

    return reply.status(200).send(playerMastery);
  });

  fastify.get('/:input/playstyle', async (req, reply) => {
    const { input } = req.params as { input: string };
    const inType = getTypeOfInput(input);
    let id = input;
    let { character } = req.query as { character?: string; };

    if (inType == 'username') {
      const user = await prisma.player.findFirst({ where: { username: input }});
      id = user.id;
    }

    try {
      const characterMastery = await prisma.playerCharacterRating.findMany({
        where: {
          playerId: id,
          ...(character && { character })
        }
      });
      const lastRating = await prisma.playerRating.findFirst({ where: { playerId: id }, orderBy: { createdAt: 'desc' } });
      if (!characterMastery || !lastRating) { return reply.status(404).send({ error: "The specified player could not be found" }) };
  
      const playstyle = calculatePlaystyle(characterMastery, lastRating.rating)
  
      return reply.status(200).send(playstyle);
    } catch (e) {
      ensureLogger.error(`Error while fetching Player Playstyle!`, e);
      if (character) { return reply.status(500).send({ error: "Something went wrong. Please make sure you are using character IDs, prefixed with 'CD_'!" }); }
      return reply.status(500).send({ error: "Something went wrong, check console for details." });
    }
    
  });
};

export default players;