import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import { PROTOCOL_VERSION, type HealthResponse } from "@taskly/shared";
import { scheduleCleanup } from "./boards/cleanup.ts";
import { registerBoardRoutes } from "./boards/routes.ts";
import { registerDemoRoutes } from "./demo/routes.ts";
import { BoardStore } from "./boards/store.ts";
import type { Db } from "./db.ts";
import { HttpError, installErrors } from "./http/errors.ts";
import { DocHub, type HubOptions } from "./collab/hub.ts";
import { installGateway, type GatewayOptions } from "./realtime/gateway.ts";
import { Tickets } from "./realtime/tickets.ts";

export interface AppDeps {
  db: Db;
  /** Exact origins allowed to make changes (the web app's). */
  origins: string[];
  store?: BoardStore;
  logger?: FastifyServerOptions["logger"];
  /** Behind the web app's rewrite and the platform's proxy: trust X-Forwarded-For for client IPs. */
  trustProxy?: boolean;
  secureCookies?: boolean;
  /** Where browsers open the WebSocket (the server's public address). */
  publicWsUrl?: string;
  realtime?: Partial<Omit<GatewayOptions, "origins" | "tickets">> & { ticketTtlMs?: number };
  collab?: Partial<HubOptions>;
  /** At most this many demo boards alive at once. */
  demoMax?: number;
  /** Remove expired boards on start and this often (0: never; tests clean up themselves). */
  cleanupEveryMs?: number;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildApp({
  db,
  origins,
  store = new BoardStore(db),
  logger = false,
  trustProxy = false,
  secureCookies = false,
  publicWsUrl = "ws://localhost:8030/ws",
  realtime = {},
  collab = {},
  demoMax = 300,
  cleanupEveryMs = 0,
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

  const tickets = new Tickets(realtime.ticketTtlMs);
  registerBoardRoutes(app, { secureCookies, tickets, publicWsUrl });
  registerDemoRoutes(app, { maxLive: demoMax, secureCookies });
  if (cleanupEveryMs > 0) {
    let stopCleanup = () => {};
    app.addHook("onReady", async () => {
      stopCleanup = scheduleCleanup(db, store, app.log, cleanupEveryMs);
    });
    app.addHook("onClose", async () => stopCleanup());
  }
  const docs = new DocHub(
    db,
    store,
    {
      saveDebounceMs: 2000,
      sessionIdleMs: 30_000,
      unloadAfterMs: 60_000,
      maxUpdateBytes: 256 * 1024,
      maxChars: 40_000,
      ...collab,
    },
    app.log,
  );
  installGateway(app, store, docs, {
    origins,
    tickets,
    snapshotAfter: realtime.snapshotAfter ?? 500,
    heartbeatMs: realtime.heartbeatMs ?? 25_000,
    maxBufferedBytes: realtime.maxBufferedBytes ?? 4 * 1024 * 1024,
  });
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    store: BoardStore;
  }
}
