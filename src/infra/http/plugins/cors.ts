import fastifyCors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

const maxAge = 86_400;
const methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"];
const allowedHeaders = ["Content-Type", "Authorization", "X-Requested-With"];
const clientOrigins = process.env.CLIENT_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean) ?? ["http://localhost:3000"];

export function registerCors(server: FastifyInstance) {
  server.register(fastifyCors, {
    origin: clientOrigins,
    methods,
    allowedHeaders,
    credentials: true,
    maxAge,
  });
}
