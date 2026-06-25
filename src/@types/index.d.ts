import type { auth } from "@/infra/lib/auth";
import "fastify";

type AuthSession = typeof auth.$Infer.Session;

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      session: AuthSession["session"];
      user: AuthSession["user"];
      organizationId?: string;
      role?: string;
    };
  }
}
