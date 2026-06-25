import fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { loggerOptions } from "./infra/http/logger-options";
import { registerCors } from "./infra/http/plugins/cors";
import { authRoutes } from "./modules/auth/routes";
import { leadsRoutes } from "./modules/leads/routes";

const server = fastify({
  logger: loggerOptions,
}).withTypeProvider<ZodTypeProvider>();

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

// PLUGINS
registerCors(server);

// ROUTES
server.get("/ping", async (_request, _reply) => "pong\n");
server.register(authRoutes);
server.register(leadsRoutes);

server.listen({ port: 8080 }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});
