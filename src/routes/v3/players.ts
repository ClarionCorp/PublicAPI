import { getTypeOfInput } from '../../core/utils';
import { appLogger } from '../../plugins/logger';
import { FastifyPluginAsync } from 'fastify';
import { searchByID } from '../../core/players/idSearch';
import { usernameSearch } from '../../core/players/userSearch';
import { regions } from '../../types/players';
import { calculatePlaystyle } from '../../core/players/misc';
import { prisma } from '../../plugins/prisma';
import { fetchCharacterMastery, fetchPlayerMastery } from '../../core/prometheus';
import { Gamemode, Role } from '../../../prisma/client';

const ensureLogger = appLogger('PlayerRoute/v3')

const playersV3Cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL = 10_000; // 10 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of playersV3Cache) {
    if (now >= entry.expiresAt) playersV3Cache.delete(key);
  }
}, 60_000);

// Users must have a valid JWT to use this endpoint.
const players: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:username', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { username } = req.params as { username: string };
    let { region, cached } = req.query as { region?: string; cached?: boolean };
    if (region && (!regions.includes(region))) { region = 'Global' };

    const cacheKey = `${username}:${region ?? 'Global'}`;
    const cachedEntry = playersV3Cache.get(cacheKey);
    if (cachedEntry && Date.now() < cachedEntry.expiresAt) { return reply.status(200).send(cachedEntry.data); };

    try {
      
    } catch (error) {
      ensureLogger.error(`Error while FETCHING PLAYER: `, error);
      return reply.status(500).send({ error });
    }
  });

  // merge with main function
  fastify.get('/:id/mastery/characters', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const charMastery = await fetchCharacterMastery(id);

    if (!charMastery) { return reply.status(404).send({ error: "The specified player could not be found" }) };

    return reply.status(200).send(charMastery);
  });


  // merge with main function
  fastify.get('/:id/mastery', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const playerMastery = await fetchPlayerMastery(id);

    if (!playerMastery) { return reply.status(404).send({ error: "The specified player could not be found" }) };

    return reply.status(200).send(playerMastery);
  });
};

export default players;