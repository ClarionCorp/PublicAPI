// The rest of the system is built to support multiple teams having the same tag.
// For now, this endpoint does not. So if that breaks, just edit this lol.

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';

const teams: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {
    let { tag, series, season } = req.query as { tag?: string; series?: string, season?: string };

    const where = {
      ...(tag && { teamTag: tag }),
      ...(series && { series }),
      ...(season && { season }),
    }

    const allTeams = await prisma.esportsTeams.findMany({
      where,
      include: {
        players: {
          select: {
            userId: true,
            linkedId: true,
            player: {
              select: {
                username: true,
                ratings: {
                  select: {
                    rating: true,
                  },
                  orderBy: {
                    createdAt: 'desc'
                  },
                  take: 1
                },
                tags: true,
                socialUrl: true
              }
            }
          }
        }
      }
    });

    const result = allTeams.map(team => ({
      teamTag: team.teamTag,
      teamName: team.teamName,
      logo: team.logo,
      series: team.series,
      season: team.season,
      players: team.players.map(p => ({
        userId: p.userId,
        linkedId: p.linkedId,
        player: p.player
          ? {
              username: p.player.username,
              rating: p.player.ratings[0]?.rating ?? null,
              tags: p.player.tags ?? [],
              socialUrl: p.player.socialUrl ?? null,
            }
          : null,
      })),
    }));
    return reply.status(200).send(result);
  });
};

export default teams;