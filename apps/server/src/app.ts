import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import { PROTOCOL_VERSION, type HealthResponse } from "@taskly/shared";
import { registerBoardRoutes } from "./boards/routes.ts";
import { BoardStore } from "./boards/store.ts";
import type { Db } from "./db.ts";
import { HttpError, installErrors } from "./http/errors.ts";

export interface AppDeps {
  db: Db;
  /** Exact origins allowed to make changes (the web app's). */
  origins: string[];
  store?: BoardStore;
  logger?: FastifyServerOptions["logger"];
  /** Behind the web app's rewrite and the platform's proxy: trust X-Forwarded-For for client IPs. */
  trustProxy?: boolean;
  secureCookies?: boolean;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildApp({
  db,
  origins,
  store = new BoardStore(db),
  logger = false,
  trustProxy = false,
  secureCookies = false,
}: AppDeps) {
  const app = Fastify({ logger, trustProxy, bodyLimit: 64 * 1024 });
  app.decorate("db", db);
  app.decorate("store", store);
  installErrors(app);

  // The participant cookie is SameSite=Lax; on top of that, anything that changes state must come from
  // the web app itself (browsers always send Origin on these requests).
  app.addHook("onRequest", async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (!origins.includes(request.headers.origin ?? "")) {
      throw new HttpError(403, "forbidden_origin", "Origem não permitida.");
    }
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  // No database query here: the landing page calls it to wake the instance up, and the platform's
  // health check must not fail because the database is momentarily slow.
  app.get("/api/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    protocolVersion: PROTOCOL_VERSION,
  }));

  registerBoardRoutes(app, { secureCookies });
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    store: BoardStore;
  }
}
