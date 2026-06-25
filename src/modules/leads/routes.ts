import type { FastifyInstance } from "fastify";
import z from "zod";
import { requireTenant } from "@/infra/http/guards/require-tenant";
import { findLeadsByOrganization } from "./repository";
import { leadSchema } from "./schema";

export function leadsRoutes(server: FastifyInstance) {
  server.get(
    "/leads",
    {
      preHandler: requireTenant,
      schema: {
        response: {
          200: z.object({
            leads: z.array(leadSchema),
          }),
        },
      },
    },
    async (request, reply) => {
      const organizationId = request.auth?.organizationId as string;
      const result = await findLeadsByOrganization(organizationId);
      reply.send({ leads: result });
    }
  );

  server.get(
    "/leads/:id",
    {
      preHandler: requireTenant,
      schema: {
        params: z.object({
          id: z.uuid(),
        }),
        response: {
          200: z.object({
            lead: leadSchema,
          }),
          404: z.null().describe("Lead Not Found"),
        },
      },
    },
    async (request, reply) => {
      console.log("GSS", request.params);
      const organizationId = request.auth?.organizationId as string;
      const result = await findLeadsByOrganization(organizationId);
      reply.send({ lead: result });
    }
  );
}
