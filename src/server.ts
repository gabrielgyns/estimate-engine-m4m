import fastifyCors from "@fastify/cors";
import { fromNodeHeaders } from "better-auth/node";
import fastify, { type FastifyServerOptions } from "fastify";
import { auth } from "./lib/auth";

const isDev = process.env.NODE_ENV !== "production";

const loggerOptions: FastifyServerOptions["logger"] = {
  level: process.env.LOG_LEVEL ?? "info",
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  }),
};

const server = fastify({ logger: loggerOptions });

server.get("/ping", async (_request, _reply) => "pong\n");

// Configure CORS policies
server.register(fastifyCors, {
  origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86_400,
});

// TODO: Move this route to another place later
server.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      // Construct request URL
      const url = new URL(request.url, `http://${request.headers.host}`);

      // Convert Fastify headers to standard Headers object
      const headers = fromNodeHeaders(request.headers);
      // Create Fetch API-compatible request
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      // Process authentication request
      const response = await auth.handler(req);
      // Forward response to client
      reply.status(response.status);
      // biome-ignore lint/suspicious/useIterableCallbackReturn: <explanation>
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body ? await response.text() : null);
    } catch (error) {
      server.log.error(`Authentication Error: ${error}`);
      return reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

server.listen({ port: 8080 }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});
