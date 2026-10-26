import { appLogger } from '@/plugins/logger';
import { FastifyPluginAsync, FastifyRequest } from 'fastify';
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

// Users without a valid JWT can use this endpoint, but are forced to cached data.
const players: FastifyPluginAsync = async (fastify) => {

  // Same checks as fastify.authenticate, but returns a boolean instead of rejecting the request.
  const hasValidToken = async (req: FastifyRequest): Promise<boolean> => {
    try {
      await req.jwtVerify();
      const entry = await fastify.prisma.userAccessToken.findUnique({ where: { id: req.user.id } });
      return !!entry?.active;
    } catch {
      return false;
    }
  };

  fastify.get('/:username', async (req, reply) => {
    const { username } = req.params as { username: string };
    let { region, cached: cachedParam, mode } = req.query as { region?: string; cached?: string | boolean; mode?: 'Ranked' | 'Normal' | 'Any' };
    if (region && (!regions.includes(region))) { region = 'Global' };
    if (!mode) { mode = 'Any' };

    // Authed users may choose (default false), unauthed users always get cached data.
    const cached = (await hasValidToken(req)) ? (cachedParam === true || cachedParam === 'true') : true;

    const cacheKey = `${username}:${region ?? 'Global'}:${mode}:${cached}`;
    const cachedEntry = playersV3Cache.get(cacheKey);
    if (cachedEntry && Date.now() < cachedEntry.expiresAt) { return reply.status(200).send(cachedEntry.data); };

    try {
      const response = await searchByUsername(username, req, region, cached, mode);
      if (!response.ok) { throw new Error(response.message) };

      playersV3Cache.set(cacheKey, { data: response.data, expiresAt: Date.now() + TTL });

      return reply.status(response.status).send(response.data);
    } catch (error) {
      ensureLogger.error(`Error while FETCHING PLAYER: `, error);
      return reply.status(500).send({ error });
    }
  });
};

export default players;