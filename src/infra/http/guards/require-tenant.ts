import { fromNodeHeaders } from "better-auth/node";
import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "@/infra/db";
import { members } from "@/infra/db/schemas";
import { auth } from "@/infra/lib/auth";

/**
 *
 * Essencialmente é o mesmo que o preHandler requireSession,
 * mas aqui também verificamos se existe o tenant/activeOrganization.
 *
 * Útil para garantir que activeOrganizationId está presente.
 */
export async function requireTenant(
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

  const { activeOrganizationId } = session.session;

  if (!activeOrganizationId) {
    return reply.status(403).send({
      error: "No active organization",
      code: "TENANT_REQUIRED",
    });
  }

  const member = await db.query.members.findFirst({
    where: and(
      eq(members.userId, session.user.id),
      eq(members.organizationId, activeOrganizationId)
    ),
  });

  if (!member) {
    return reply.status(403).send({
      error: "Forbidden",
      code: "TENANT_ACCESS_DENIED",
    });
  }

  request.auth = {
    session: session.session,
    user: session.user,
    organizationId: activeOrganizationId,
    role: member.role,
  };
}
