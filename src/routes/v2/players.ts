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
    const { region, cached } = req.query as { region?: string; cached?: boolean };
    const inType = getTypeOfInput(input);

    // Support IDs in the future.
    if (inType == 'id') {
      ensureLogger.info(`User is searching with ID, passing off to ID-Search...`);
      const response = await searchByID(input, req, region, cached);
      return reply.status(response.status).send(response.ok ? response.data : { error: response.message });
    } else {
      const response = await usernameSearch(input, req, region, cached);

      return reply.status(response.status).send(response.ok ? response.data : { error: response.message });
    }
  });
};

export default players;