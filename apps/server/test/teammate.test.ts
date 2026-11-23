import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import type {
  BoardEvent,
  BoardSnapshot,
  CreateBoardResponse,
  ServerMessage,
  TicketResponse,
} from "@taskly/shared";
import { buildApp } from "../src/app.ts";
import { ORIGIN, testDb } from "./support.ts";
import { is, TestClient } from "./ws-client.ts";

const db = testDb();
const app = await buildApp({
  db,
  origins: [ORIGIN],
  teammate: { pauseMs: [20, 40], keystrokeMs: [1, 2], dragMs: 15, typeChance: 0.5 },
  collab: { saveDebounceMs: 20, sessionIdleMs: 60_000, unloadAfterMs: 50 },
});
await app.listen({ port: 0, host: "127.0.0.1" });
const base = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`;
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const presence = (m: ServerMessage): m is Extract<ServerMessage, { t: "presence" }> => m.t === "presence";

describe("the simulated teammate", () => {
  it("works on a demo board while someone watches, through the same paths as a person, and stops after", async () => {
    const created = await app.inject({ method: "POST", url: "/api/demo", headers: { origin: ORIGIN } });
    const { boardId } = created.json<CreateBoardResponse>();
    const cookie = String(created.headers["set-cookie"]).split(";")[0]!;
    const headers = { origin: ORIGIN, cookie };
    const { board } = (await app.inject({ url: `/api/boards/${boardId}`, headers })).json<BoardSnapshot>();
    const bia = Object.values(board.participants).find((p) => p.simulated)!;

    // Nobody watching yet: she does nothing.
    await new Promise((r) => setTimeout(r, 150));
    expect((await db.board.findUniqueOrThrow({ where: { id: boardId } })).seq).toBe(board.seq);

    const { url } = (
      await app.inject({ method: "POST", url: `/api/boards/${boardId}/ticket`, headers })
    ).json<TicketResponse>();
    const client = await TestClient.open(`${base}${new URL(url).search}`, ORIGIN);
    client.hello(board.seq);
    await client.until(is("synced"));

    await client.until((m): m is never => presence(m) && m.online.includes(bia.id));
    await client.until(
      (m): m is never =>
        presence(m) && m.activity.some((a) => a.participantId === bia.id && a.mode === "dragging"),
    );
    const moved = await client.until(
      (m): m is Extract<ServerMessage, { t: "event" }> =>
        m.t === "event" && m.event.actorId === bia.id && m.event.type === "card.moved",
    );
    expect(moved.event.type).toBe("card.moved");
    // Writing in a description ends a session when she closes it: it's in the history, text saved.
    const described = await client.until(
      (m): m is Extract<ServerMessage, { t: "event" }> =>
        m.t === "event" && m.event.actorId === bia.id && m.event.type === "card.described",
      0,
      15_000,
    );
    const cardId = (described.event as Extract<BoardEvent, { type: "card.described" }>).payload.cardId;
    const card = await db.card.findUniqueOrThrow({ where: { boardId_id: { boardId, id: cardId } } });
    expect(card.descriptionText.length).toBeGreaterThan(10);

    client.close();
    await new Promise((r) => setTimeout(r, 200));
    const after = (await db.board.findUniqueOrThrow({ where: { id: boardId } })).seq;
    await new Promise((r) => setTimeout(r, 300));
    expect((await db.board.findUniqueOrThrow({ where: { id: boardId } })).seq).toBe(after);
  }, 30_000);
});
