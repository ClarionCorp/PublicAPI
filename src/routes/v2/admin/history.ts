import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../../plugins/prisma';
import { adminCheck } from '../../../core/adminCheck';
import { appLogger } from '../../../plugins/logger';

const logger = appLogger('Admin')

// Delete 
const adminHistory: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/nameHistory', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const auth = await adminCheck(req, 'Delete Name History');
    if (!auth.allowed) { return reply.status(403).send({ error: auth.message }) };

    const body = req.body as { userId: string, dates: Date[] };
    const { userId, dates } = body;
    if (!userId || !dates || dates.length == 0) { return reply.status(400).send({ error: 'Missing fields' }) };

    try {
      for (const changedAt of dates) {
        await prisma.nameHistory.delete({
          where: {
            userId_changedAt: {
              userId,
              changedAt: new Date(changedAt),
            },
          },
        });
      }

      // I'm comfortable with doing [0] because we would never delete separate players at the same time.
      const newNameHistory = await prisma.nameHistory.findMany({
        where: { userId }
      });

      return reply.status(200).send(newNameHistory);
    } catch (error) {
      logger.error(`Failed to delete Name History for ${userId}!`, error);
      return reply.status(500).send("Something went wrong. Check console for details.");
    }
  });
};

export default adminHistory;