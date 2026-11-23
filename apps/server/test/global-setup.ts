import { createDb } from "../src/db.ts";
import { prepareDatabase } from "../scripts/prepare-db.ts";

/** Creates the test database when it's missing, migrates it, and starts every run from empty boards. */
export default async function setup() {
  const url = process.env["TEST_DATABASE_URL"] ?? "postgresql://taskly:taskly@localhost:5438/taskly_test";
  await prepareDatabase(url);
  const db = createDb(url);
  try {
    await db.$executeRawUnsafe("TRUNCATE boards CASCADE");
  } finally {
    await db.$disconnect();
  }
}
