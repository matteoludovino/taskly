import { buildApp } from "./app.ts";
import { createDb } from "./db.ts";
import { loadEnv } from "./env.ts";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = await buildApp({
  db,
  origins: env.WEB_ORIGINS,
  trustProxy: env.TRUST_PROXY,
  secureCookies: env.NODE_ENV === "production",
  publicWsUrl: env.PUBLIC_WS_URL,
  demoMax: env.DEMO_MAX_BOARDS,
  cleanupEveryMs: 6 * 60 * 60 * 1000,
  logger: {
    level: env.LOG_LEVEL,
    // Log the path only: the WebSocket handshake carries its one-time ticket in the query string.
    serializers: { req: (req) => ({ method: req.method, url: req.url.split("?")[0] }) },
  },
});

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "shutting down");
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: env.PORT, host: env.HOST });
