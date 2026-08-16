import { FastifyRequest } from 'fastify';

const default_ms = 30 * 60 * 1000; // 30 minutes

type TierLimits = Record<number, { requests: number; timeWindowMs?: number }>;

// Builds a per-route `config.rateLimit` object where the threshold depends on
// the caller's access tier. Unauthenticated requests are treated as tier 0.
// `timeWindowMs` defaults to 30 minutes when omitted for a tier.
export function rateLimitByTier(limits: TierLimits) {
  const lowestTier = Math.min(...Object.keys(limits).map(Number));
  const fallback = limits[lowestTier];

  const forRequest = (req: FastifyRequest) => limits[req.user?.tier ?? 0] ?? fallback;

  return {
    max: async (req: FastifyRequest) => forRequest(req).requests,
    timeWindow: async (req: FastifyRequest) => forRequest(req).timeWindowMs ?? default_ms,
  };
}
