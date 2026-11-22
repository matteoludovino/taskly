import { randomBytes } from "node:crypto";
import { uuidv7, type Envelope, type Operation } from "@taskly/shared";
import { buildApp } from "../src/app.ts";
import { createDb, type Db } from "../src/db.ts";

export const testDb = (): Db => createDb(process.env["DATABASE_URL"]!);

/** An empty board row (no columns, no participants) with a random id. */
export async function bareBoard(db: Db, title = "Quadro de teste"): Promise<string> {
  const id = randomBytes(8).toString("base64url").replace(/[-_]/g, "x").slice(0, 10);
  await db.board.create({ data: { id, keyHash: randomBytes(32), title } });
  return id;
}

export const op = (operation: Operation): Envelope => ({ clientOpId: uuidv7(), op: operation });

export const ORIGIN = "http://localhost:3020";

export function testApp(db: Db) {
  return buildApp({ db, origins: [ORIGIN] });
}
