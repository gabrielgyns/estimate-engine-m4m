import type { FastifyInstance } from "fastify";
import z from "zod";
import { requireTenant } from "@/infra/http/guards/require-tenant";
import {
  createLeadWithOrganization,
  deleteLeadByIdWithOrganization,
  findLeadByIdForOrganization,
  findLeadsByOrganization,
  updateLeadByIdWithOrganization,
} from "./repository";
import {
  type CreateLead,
  createLeadSchema,
  leadSchema,
  type UpdateLead,
  updateLeadSchema,
} from "./schema";

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
      const { id } = request.params as { id: string };
      const organizationId = request.auth?.organizationId as string;

      const lead = await findLeadByIdForOrganization(id, organizationId);

      if (!lead) {
        return reply.status(404).send(null);
      }

      return reply.send({ lead });
    }
  );

  server.post(
    "/leads",
    {
      preHandler: requireTenant,
      schema: {
        params: z.object({
          id: z.uuid(),
        }),
        body: createLeadSchema,
        response: {
          201: z
            .object({ leadId: z.uuid() })
            .describe("Lead Created Successfully!"),
        },
      },
    },
    async (request, reply) => {
      const body = request.body as CreateLead;
      const organizationId = request.auth?.organizationId as string;

      const leadId = await createLeadWithOrganization(body, organizationId);

      return reply.status(201).send({ leadId });
    }
  );

  server.patch(
    "/leads/:id",
    {
      preHandler: requireTenant,
      schema: {
        params: z.object({ id: z.uuid() }),
        body: updateLeadSchema,
        response: {
          200: z.object({ leadId: z.uuid() }),
          404: z.null(),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as UpdateLead;
      const organizationId = request.auth?.organizationId as string;

      const updatedId = await updateLeadByIdWithOrganization(
        body,
        id,
        organizationId
      );

      if (!updatedId) {
        return reply.status(404).send(null);
      }

      return reply.status(200).send({ leadId: updatedId });
    }
  );

  server.delete(
    "/leads/:id",
    {
      preHandler: requireTenant,
      schema: {
        params: z.object({ id: z.uuid() }),
        response: {
          204: z.void(),
          404: z.null(),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const organizationId = request.auth?.organizationId as string;

      const wasDeleted = await deleteLeadByIdWithOrganization(
        id,
        organizationId
      );

      if (!wasDeleted) {
        return reply.status(404).send(null);
      }

      return reply.status(204).send();
    }
  );
}
