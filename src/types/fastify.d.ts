import { Guild } from '@prisma/client';
import 'fastify';
import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void>;
  }

  // For `request.entry` after jwtVerify():
  interface FastifyRequest {
    user?: {
      id: number;
      name: string;
      owner: string;
    };
  }
}
