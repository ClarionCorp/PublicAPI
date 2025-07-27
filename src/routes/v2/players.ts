import { getTypeOfInput } from '../../core/utils';
import { appLogger } from '../../plugins/logger';
import { FastifyPluginAsync } from 'fastify';
import { searchByID } from '../../core/players/idSearch';
import { usernameSearch } from '../../core/players/userSearch';

const ensureLogger = appLogger('PlayerRoute')

// Users must have a valid JWT to use this endpoint.
// I hate doing this but we cannot gamble someone abusing it.
// (If we get rate limited it could shutdown CC)
const players: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:input', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { input } = req.params as { input: string };
    let { region, cached } = req.query as { region?: string; cached?: boolean };
    const inType = getTypeOfInput(input);
    const regions = ['Global', 'NorthAmerica', 'Europe', 'SouthAmerica', 'Asia', 'Oceania', 'JapaneseLanguageText'];

    if (region && (!regions.includes(region))) { region = 'Global' };

    if (inType == 'id') {
      ensureLogger.info(`User is searching with ID, passing off to ID-Search...`);
      const response = await searchByID(input, req, region, cached);
      return reply.status(response.status).send(response.ok ? response.data : { error: response.message });
    } else {
      const response = await usernameSearch(input, req, region, cached);

      return reply.status(response.status).send(response.ok ? response.data : { error: response.message });
    }
  });

  // Pretty primitive, but gets the job done for now.
  // I don't want to include it in the one above by default cos it adds an extra 300ms on ALL searches.
  fastify.get('/:id/mastery/characters', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const charMastery = await prometheusService.mastery.character(id);

    if (!charMastery) { return reply.status(404).send({ error: "The specified player could not be found" }) };

    return reply.status(200).send(charMastery);
  });

  // Comments apply to this one too.
  fastify.get('/:id/mastery', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const playerMastery = await prometheusService.mastery.player(id);

    if (!playerMastery) { return reply.status(404).send({ error: "The specified player could not be found" }) };

    return reply.status(200).send(playerMastery);
  });
};

export default players;