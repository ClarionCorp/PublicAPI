import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    //  Pre-Handler for JWT Authentication  //
    authenticate: (req: any, reply: any) => Promise<void>;
  }
}