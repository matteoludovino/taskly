import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../src/db.ts";

const db = createDb(process.env["DATABASE_URL"]!);
afterAll(() => db.$disconnect());

describe("schema", () => {
  it("no longer has the legacy tasks table", async () => {
    const rows = await db.$queryRaw<unknown[]>`
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks'`;
    expect(rows).toHaveLength(0);
  });

  it("orders positions byte by byte, like JavaScript", async () => {
    // A locale collation would put "a0" before "Zz" (case-insensitive first pass); keys need "Zz" first.
    const keys = ["a0", "Zz", "a0V", "b", "A"];
    const rows = await db.$queryRaw<{ position: string }[]>`
      SELECT position FROM unnest(${keys}::text[]) AS k(position)
      ORDER BY position COLLATE "C"`;
    expect(rows.map((r) => r.position)).toEqual([...keys].sort());

    const columns = await db.$queryRaw<{ table_name: string; collation_name: string | null }[]>`
      SELECT table_name, collation_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'position' ORDER BY table_name`;
    expect(columns).toEqual([
      { table_name: "cards", collation_name: "C" },
      { table_name: "columns", collation_name: "C" },
    ]);
  });
});
