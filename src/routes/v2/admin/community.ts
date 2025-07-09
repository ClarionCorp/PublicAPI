import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { appLogger } from '../../../plugins/logger';
import { prisma } from '../../../plugins/prisma';
import { failedLogin } from '../../../core/analytics';

const logger = appLogger('Admin')
const regions = new Set(['Global', 'NA East', 'NA West', 'Europe', 'Asia', 'Japan', 'Oceania']);
const realTags = new Set(['tournaments', 'casual', 'competitive', 'custom-games', 'content-creator', 'verified', 'meta']);

async function adminCheck(req: FastifyRequest, reply: FastifyReply, note: string) {
  // Put this in a function since I'm lazy and hard coding owner names :p
  if (req.user.owner !== 'blals' && req.user.owner !== 'lukimana') {
    await failedLogin('V2_ADMIN', req.ip, note, req.user.id);
    return reply.code(401).send({ error: `You are not authorized to use this endpoint. This request has been logged.` });
  };
}

const adminCommunity: FastifyPluginAsync = async (fastify) => {
  // Add Community
  fastify.post('/community', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    await adminCheck(req, reply, 'Add Community');

    const body = req.body as {
      name: string;
      invite: string;
      description: string;
      year: number;
      region: string;
      tags: string[];
      icon?: string; // url
      banner?: string; // url
      weight?: number;
    };

    const { name, invite, description, year, region, tags, icon, banner, weight } = body;

    if (!name || !invite || !description || !year) { return reply.status(400).send({ error: 'Missing fields' }) };
    if (!regions.has(region)) { return reply.code(400).send({ error: 'Invalid region value provided.' }) };
    if (tags && (!Array.isArray(tags) || !tags.every(tag => realTags.has(tag)))) { return reply.code(400).send({ error: 'One or more tags are invalid.' }) };

    const existing = await prisma.communities.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { inviteUrl: { equals: invite, mode: 'insensitive' } }
        ]
      }
    });

    if (existing) { return reply.status(409).send({ error: 'A Community of this name or invite already exists. For editing, use PATCH.' }) }

    try {
      const community = await prisma.communities.create({
        data: {
          name,
          inviteUrl: invite,
          description,
          yearEst: year,
          region,
          tags,
          weight,
          iconUrl: icon ?? '/communities/icons/default.webp',
          bannerUrl: banner ?? '/communities/banners/default.webp',
        }
      })

      return reply.status(201).send(community);
    } catch (e) {
      logger.error(e);
      return reply.status(500).send({ error: 'Something went wrong while creating the community. Check logs for more information.' });
    }
  });

  // Edit Community -- NOT FULLY TESTED
  fastify.patch('/community', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    await adminCheck(req, reply, 'Edit Community');
    
    const body = req.body as {
      name?: string;
      invite: string;
      description?: string;
      year?: number;
      region?: string;
      tags?: string[];
      icon?: string; // url
      banner?: string; // url
      weight?: number;
    };

    const { name, invite, description, year, region, tags, icon, banner, weight } = body;

    if (!invite) { return reply.status(400).send({ error: 'The invite field is required to edit.' }) };
    if (region && !regions.has(region)) { return reply.code(400).send({ error: 'Invalid region value provided.' }) };
    if (tags && (!Array.isArray(tags) || !tags.every(tag => realTags.has(tag)))) { return reply.code(400).send({ error: 'One or more tags are invalid.' }) };

    try {
      const changes = await prisma.communities.update({
        where: { inviteUrl: invite },
        data: {
          description,
          yearEst: year,
          name,
          iconUrl: icon,
          bannerUrl: banner,
          weight,
          region,
          tags
        }
      })

      return reply.status(200).send(changes);
    } catch (e) {
      logger.error(e);
      return reply.status(500).send({ error: 'Something went wrong while editing the community. Check logs for more information.' });
    }
  });

  // Delete Community
  fastify.delete('/community', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    await adminCheck(req, reply, 'Delete Community');
    
    const body = req.body as {
      invite: string;
    };

    const { invite } = body;
    if (!invite) { return reply.status(400).send({ error: 'The invite field is required to delete.' }) };

    const exists = await prisma.communities.findFirst({ where: { inviteUrl: invite } });
    if (!exists) { return reply.status(400).send({ error: 'The provided community does not exist.' }) }

    try {
      await prisma.communities.delete({ where: { inviteUrl: invite } });
      return reply.status(200).send({ message: 'Successfully deleted community.' });
    } catch (e) {
      logger.error(e);
      return reply.status(500).send({ error: 'Something went wrong while deleting the community. Check logs for more information.' });
    }
  });
};

export default adminCommunity;
