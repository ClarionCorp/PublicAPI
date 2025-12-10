import { FastifyReply, FastifyRequest } from "fastify";
import { failedLogin } from "./analytics";

type ReturnType = {
  message?: string,
  allowed: boolean
}

export async function adminCheck(req: FastifyRequest, note: string): Promise<ReturnType> {
  // Put this in a function since I'm lazy and hard coding owner names :p
  if (req.user.owner !== 'blals' && req.user.owner !== 'lukimana') {
    await failedLogin('V2_ADMIN', req.ip, note, req.user.id);
    return { allowed: false, message: `You are not authorized to use this endpoint. This request has been logged.` }
  };

  return { allowed: true }
}