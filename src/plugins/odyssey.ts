import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../plugins/prisma'
import { PrometheusService } from '../core/prometheus'
import { appLogger } from './logger'

const odyLogger = appLogger('PrometheusService');

const prometheusPlugin: FastifyPluginAsync = async (fastify) => {
  // Fetch current tokens from the database
  const row = await prisma.token.findUnique({
    where: { service: 'ODYSSEY' },
    select: { token: true, refreshToken: true },
  })

  if (!row?.token || !row?.refreshToken) {
    odyLogger.error('Odyssey tokens missing in database (table Token, service = ODYSSEY)');
    return;
  }

  // Wire up Prometheus Service
  const instance =
    globalThis.prometheusService ??
    new PrometheusService({
      token:   row.token,
      refresh: row.refreshToken,
      save: async ({ token, refresh }) => {
        await prisma.token.update({
          where: { service: 'ODYSSEY' },
          data : { token, refreshToken: refresh, updatedAt: new Date() },
        })
      },
    })

  globalThis.prometheusService = instance
  fastify.decorate('prometheus', instance)
  fastify.log.info('[+] Prometheus Service started! (Pulled tokens from DB)');
}

declare module 'fastify' {
  interface FastifyInstance {
    prometheus: PrometheusService;
  }
}

export default fp(prometheusPlugin)
