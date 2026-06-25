import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import { auth } from "@/infra/lib/auth";

/**
 *
 * Hook for preHandler's
 */
export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session) {
    return reply.status(401).send({
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
    });
  }

  request.auth = {
    session: session.session,
    user: session.user,
  };
}
