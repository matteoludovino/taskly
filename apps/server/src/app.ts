import Fastify, { type FastifyServerOptions } from "fastify";
import { PROTOCOL_VERSION, type HealthResponse } from "@taskly/shared";
import type { Db } from "./db.ts";

export interface AppDeps {
  db: Db;
  logger?: FastifyServerOptions["logger"];
}

export function buildApp({ db, logger = false }: AppDeps) {
  const app = Fastify({ logger, bodyLimit: 64 * 1024 });
  app.decorate("db", db);

  // No database query here: the landing page calls it to wake the instance up, and the platform's
  // health check must not fail because the database is momentarily slow.
  app.get("/api/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    protocolVersion: PROTOCOL_VERSION,
  }));

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}
