import { afterAll, describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, healthResponse } from "@taskly/shared";
import { createDb } from "../src/db.ts";
import { testApp } from "./support.ts";

const db = createDb(process.env["DATABASE_URL"]!);
const app = await testApp(db);

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("GET /api/health", () => {
  it("reports the protocol version in the shared shape", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(healthResponse.parse(response.json())).toEqual({
      status: "ok",
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  it("answers without the database", async () => {
    const offline = createDb("postgresql://nobody:nothing@127.0.0.1:1/none");
    const isolated = await testApp(offline);
    const response = await isolated.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    await isolated.close();
  });
});

describe("database", () => {
  it("is reachable and migrated", async () => {
    const tables = await db.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    expect(tables.map((t) => t.table_name)).toContain("_prisma_migrations");
  });
});
