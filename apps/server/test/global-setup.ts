import { execFileSync } from "node:child_process";
import { createDb } from "../src/db.ts";

/** Creates the test database when it's missing and brings it to the latest migration. */
export default async function setup() {
  const url = new URL(
    process.env["TEST_DATABASE_URL"] ?? "postgresql://taskly:taskly@localhost:5438/taskly_test",
  );
  const name = url.pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected test database name: ${name}`);

  const admin = createDb(Object.assign(new URL(url), { pathname: "/postgres" }).toString());
  try {
    const found = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (found.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }

  const { DIRECT_DATABASE_URL: _ignored, ...env } = process.env;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...env, DATABASE_URL: url.toString() },
    stdio: "pipe",
  });

  // Start every run from empty boards.
  const db = createDb(url.toString());
  try {
    await db.$executeRawUnsafe("TRUNCATE boards CASCADE");
  } finally {
    await db.$disconnect();
  }
}
