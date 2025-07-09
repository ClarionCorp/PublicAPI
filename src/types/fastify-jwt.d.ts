import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: number;
      name: string;
      owner: string;
    };
    user: {
      id: number;
      name: string;
      owner: string;
    };
  }
}