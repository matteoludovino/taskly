// Usage: tsx scripts/prepare-db.ts <database url>
// Creates the database when it's missing and brings it to the latest migration (tests and end-to-end runs).
import { execFileSync } from "node:child_process";
import { createDb } from "../src/db.ts";

export async function prepareDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const name = url.pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected database name: ${name}`);

  const admin = createDb(Object.assign(new URL(url), { pathname: "/postgres" }).toString());
  try {
    const found = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (found.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }

  const { DIRECT_DATABASE_URL: _ignored, ...env } = process.env;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...env, DATABASE_URL: url.toString() },
    stdio: "pipe",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) throw new Error("Usage: tsx scripts/prepare-db.ts <database url>");
  await prepareDatabase(url);
  console.log(`ready: ${new URL(url).pathname.slice(1)}`);
}
