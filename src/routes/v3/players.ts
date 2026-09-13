import { appLogger } from '@/plugins/logger';
import { FastifyPluginAsync } from 'fastify';
import { regions } from '@/types/players';
import { searchByUsername } from '@/core/players/v3/search';

const ensureLogger = appLogger('PlayerRoute/v3')

const playersV3Cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL = 60_000; // 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of playersV3Cache) {
    if (now >= entry.expiresAt) playersV3Cache.delete(key);
  }
}, TTL);

// Users must have a valid JWT to use this endpoint.
const players: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:username', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { username } = req.params as { username: string };
    let { region, cached, mode } = req.query as { region?: string; cached?: boolean; mode?: 'Ranked' | 'Normal' };
    if (region && (!regions.includes(region))) { region = 'Global' };

    const cacheKey = `${username}:${region ?? 'Global'}`;
    const cachedEntry = playersV3Cache.get(cacheKey);
    if (cachedEntry && Date.now() < cachedEntry.expiresAt) { return reply.status(200).send(cachedEntry.data); };

    try {
      const response = await searchByUsername(username, req, region, cached, mode);
      if (!response.ok) { throw new Error(response.message) };

      return reply.status(response.status).send(response.data);
    } catch (error) {
      ensureLogger.error(`Error while FETCHING PLAYER: `, error);
      return reply.status(500).send({ error });
    }
  });
};

export default players;