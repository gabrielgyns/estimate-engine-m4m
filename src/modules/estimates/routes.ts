import type { FastifyInstance } from "fastify";
import z from "zod";
import { requireTenant } from "@/infra/http/guards/require-tenant";
import {
  createEstimateWithOrganization,
  deleteEstimateByIdWithOrganization,
  findEstimateByIdForOrganization,
  findEstimatesByLeadForOrganization,
  findEstimatesByOrganization,
  sendEstimateByIdWithOrganization,
  updateEstimateByIdWithOrganization,
} from "./repository";
import {
  type CreateEstimate,
  createEstimateSchema,
  estimateSchema,
  estimateSummarySchema,
  type UpdateEstimate,
  updateEstimateSchema,
} from "./schema";

export function estimatesRoutes(server: FastifyInstance) {
  server.get(
    "/estimates",
    {
      preHandler: requireTenant,
      schema: {
        response: {
          200: z.object({
            estimates: z.array(estimateSummarySchema),
          }),
        },
      },
    },
    async (request, reply) => {
      const organizationId = request.auth?.organizationId as string;
      const result = await findEstimatesByOrganization(organizationId);

      return reply.send({ estimates: result });
    }
  );

  server.get(
    "/estimates/:id",
    {
      preHandler: requireTenant,
      schema: {
        params: z.object({ id: z.uuid() }),
        response: {
          200: z.object({ estimate: estimateSchema }),
          404: z.null(),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const organizationId = request.auth?.organizationId as string;

      const estimate = await findEstimateByIdForOrganization(
        id,
        organizationId
      );

      if (!estimate) {
        return reply.status(404).send(null);
      }

      return reply.send({ estimate });
    }
  );

  server.get(
    "/leads/:id/estimates",
    {
      preHandler: requireTenant,
      schema: {
        params: z.object({ id: z.uuid() }),
        response: {
          200: z.object({
            estimates: z.array(estimateSummarySchema),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const organizationId = request.auth?.organizationId as string;

      const result = await findEstimatesByLeadForOrganization(
        id,
        organizationId
      );

      return reply.send({ estimates: result });
    }
  );

  server.post(
    "/estimates",
    {
      preHandler: requireTenant,
      schema: {
        body: createEstimateSchema,
        response: {
          201: z.object({ estimateId: z.uuid() }),
          404: z.null(),
        },
      },
    },
    async (request, reply) => {
      const body = request.body as CreateEstimate;
      const organizationId = request.auth?.organizationId as string;

      const estimateId = await createEstimateWithOrganization(
        body,
        organizationId
      );

      if (!estimateId) {
        return reply.status(404).send(null);
      }

      return reply.status(201).send({ estimateId });
    }
  );

  server.patch(
    "/estimates/:id",
    {
      preHandler: requireTenant,
      schema: {
        params: z.object({ id: z.uuid() }),
        body: updateEstimateSchema,
        response: {
          200: z.object({ estimateId: z.uuid() }),
          404: z.null(),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as UpdateEstimate;
      const organizationId = request.auth?.organizationId as string;

      const estimateId = await updateEstimateByIdWithOrganization(
        body,
        id,
        organizationId
      );

      if (!estimateId) {
        return reply.status(404).send(null);
      }

      return reply.send({ estimateId });
    }
  );

  server.post(
    "/estimates/:id/send",
    {
      preHandler: requireTenant,
      schema: {
        params: z.object({ id: z.uuid() }),
        response: {
          200: z.object({ estimateId: z.uuid() }),
          404: z.null(),
          409: z.null(),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const organizationId = request.auth?.organizationId as string;

      const result = await sendEstimateByIdWithOrganization(id, organizationId);

      if (result === "not_found") {
        return reply.status(404).send(null);
      }

      if (result === "invalid_status") {
        return reply.status(409).send(null);
      }

      return reply.send({ estimateId: result });
    }
  );

  server.delete(
    "/estimates/:id",
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

      const wasDeleted = await deleteEstimateByIdWithOrganization(
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
