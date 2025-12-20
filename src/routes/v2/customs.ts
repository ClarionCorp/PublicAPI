// Assorted stuff that people can use :)

import { fetchCustomLobbies } from '../../core/prometheus';
import { FastifyPluginAsync } from 'fastify';

type LobbySearchProps = {
  search: string,
  excludeFull?: string
}

const customs: FastifyPluginAsync = async (fastify) => {
  fastify.get('/browse', async (req, reply) => {
    let { search, excludeFull } = req.query as LobbySearchProps;
    
    const fetchUpstream = await fetchCustomLobbies(search, Boolean(excludeFull));

    return reply.status(200).send({ lobbies: fetchUpstream });
  });
};

export default customs;
