// Assorted stuff that people can use :)

import { sendToAnalytics } from '../../core/analytics';
import { fetchCustomLobbies } from '../../core/prometheus';
import { FastifyPluginAsync } from 'fastify';

type LobbySearchProps = {
  search: string,
  excludeFull?: string
}

const customs: FastifyPluginAsync = async (fastify) => {
  fastify.get('/browse', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    let { search, excludeFull } = req.query as LobbySearchProps;
    
    const fetchUpstream = await fetchCustomLobbies(search, Boolean(excludeFull));
    await sendToAnalytics('V2_CUSTOMS_BROWSE', req.ip, req.user!.id, `${search}`);

    return reply.status(200).send({ lobbies: fetchUpstream });
  });
};

export default customs;