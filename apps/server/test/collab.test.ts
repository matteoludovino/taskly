import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  sortedColumns,
  uuidv7,
  type BoardSnapshot,
  type CreateBoardResponse,
  type Operation,
  type TicketResponse,
} from "@taskly/shared";
import { buildApp, type AppDeps } from "../src/app.ts";
import { plainText } from "../src/collab/text.ts";
import { DocClient } from "./doc-client.ts";
import { ORIGIN, testDb } from "./support.ts";
import { is, TestClient } from "./ws-client.ts";

const db = testDb();
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterAll(async () => {
  for (const app of apps) await app.close().catch(() => undefined);
  await db.$disconnect();
});

const quick = { saveDebounceMs: 50, sessionIdleMs: 150, unloadAfterMs: 100, maxChars: 200 };

async function server(collab: AppDeps["collab"] = quick) {
  const app = await buildApp({ db, origins: [ORIGIN], collab });
  await app.listen({ port: 0, host: "127.0.0.1" });
  apps.push(app);
  const base = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`;
  const headers = (cookie?: string) => ({ origin: ORIGIN, ...(cookie ? { cookie } : {}) });

  async function board() {
    const created = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: headers(),
      payload: { title: "Textos", name: "Ana", color: "#2563eb" },
    });
    const { boardId, key } = created.json<CreateBoardResponse>();
    const cookie = String(created.headers["set-cookie"]).split(";")[0]!;
    const snapshot = (
      await app.inject({ url: `/api/boards/${boardId}`, headers: headers(cookie) })
    ).json<BoardSnapshot>();
    const cardId = uuidv7();
    await op(boardId, cookie, {
      type: "card.create",
      cardId,
      columnId: sortedColumns(snapshot.board)[0]!.id,
      title: "Com descrição",
    });
    return { boardId, key, cookie, cardId };
  }

  const op = (boardId: string, cookie: string, operation: Operation) =>
    app.inject({
      method: "POST",
      url: `/api/boards/${boardId}/ops`,
      headers: headers(cookie),
      payload: { clientOpId: uuidv7(), op: operation },
    });

  async function join(boardId: string, key: string, name: string) {
    const response = await app.inject({
      method: "POST",
      url: `/api/boards/${boardId}/join`,
      headers: headers(),
      payload: { key, name, color: "#db2777" },
    });
    return String(response.headers["set-cookie"]).split(";")[0]!;
  }

  /** A synced connection with the card's document open. */
  async function open(boardId: string, cookie: string, cardId: string) {
    const ticket = (
      await app.inject({ method: "POST", url: `/api/boards/${boardId}/ticket`, headers: headers(cookie) })
    ).json<TicketResponse>();
    const client = await TestClient.open(`${base}${new URL(ticket.url).search}`, ORIGIN);
    client.hello(0);
    await client.until(is("synced"));
    const doc = new DocClient(client, cardId);
    doc.subscribe();
    return { client, doc };
  }

  return { app, board, join, open, op };
}

const stored = async (boardId: string, cardId: string) =>
  db.card.findUniqueOrThrow({ where: { boardId_id: { boardId, id: cardId } } });

describe("collaborative descriptions", () => {
  it("only open cards of the connection's own board", async () => {
    const s = await server();
    const mine = await s.board();
    const other = await s.board();
    const { client, doc } = await s.open(mine.boardId, mine.cookie, other.cardId);
    await doc.until(() => doc.denied !== null);
    expect(doc.denied).toBe("not_found");
    const unknown = new DocClient(client, uuidv7());
    unknown.subscribe();
    await unknown.until(() => unknown.denied !== null);
    client.close();
  });

  it("merge concurrent typing from two people, and save the result", async () => {
    const s = await server();
    const { boardId, key, cookie, cardId } = await s.board();
    const ana = await s.open(boardId, cookie, cardId);
    const bruno = await s.open(boardId, await s.join(boardId, key, "Bruno"), cardId);
    await ana.doc.until(() => ana.doc.synced);
    await bruno.doc.until(() => bruno.doc.synced);
    ana.doc.write("Comprar ");
    await bruno.doc.until(() => bruno.doc.text() === "Comprar ");
    // Both type at once, at different places.
    ana.doc.type(8, "caixas");
    bruno.doc.type(0, ">> ");
    await ana.doc.until(() => ana.doc.text() === bruno.doc.text() && ana.doc.text().length === 17);
    expect(ana.doc.text()).toBe(">> Comprar caixas");
    await ana.doc.until(() => false, 200).catch(() => undefined); // let the debounced save run
    expect((await stored(boardId, cardId)).descriptionText).toBe(">> Comprar caixas");
    ana.client.close();
    bruno.client.close();
  });

  it("give a late joiner everything, from memory or (after unloading) from the database", async () => {
    const s = await server();
    const { boardId, cookie, cardId } = await s.board();
    const first = await s.open(boardId, cookie, cardId);
    await first.doc.until(() => first.doc.synced);
    first.doc.write("Escrito antes");
    await first.doc.until(() => false, 150).catch(() => undefined);
    first.client.close();
    await new Promise((r) => setTimeout(r, 300)); // unloaded by now
    const late = await s.open(boardId, cookie, cardId);
    await late.doc.until(() => late.doc.text() === "Escrito antes");
    late.client.close();
  });

  it("merge with what's stored when saving, so two servers editing one card both keep their text", async () => {
    const one = await server();
    const two = await server();
    const { boardId, cookie, cardId } = await one.board();
    const a = await one.open(boardId, cookie, cardId);
    const b = await two.open(boardId, cookie, cardId);
    await a.doc.until(() => a.doc.synced);
    await b.doc.until(() => b.doc.synced);
    a.doc.write("Do servidor um");
    b.doc.write("Do servidor dois");
    await new Promise((r) => setTimeout(r, 300));
    const row = await stored(boardId, cardId);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, row.descriptionDoc!);
    expect(plainText(doc).split("\n").sort()).toEqual(["Do servidor dois", "Do servidor um"]);
    a.client.close();
    b.client.close();
  });

  it("record an edit session in the history once the person stops typing", async () => {
    const s = await server();
    const { boardId, cookie, cardId } = await s.board();
    const { client, doc } = await s.open(boardId, cookie, cardId);
    await doc.until(() => doc.synced);
    doc.write("Ligar para o síndico   antes das 18h");
    const event = await client.until(
      (m): m is Extract<typeof m, { t: "event" }> => m.t === "event" && m.event.type === "card.described",
    );
    expect(event.event.payload).toMatchObject({ cardId, preview: "Ligar para o síndico antes das 18h" });
    const snapshot = (
      await s.app.inject({ url: `/api/boards/${boardId}`, headers: { cookie } })
    ).json<BoardSnapshot>();
    expect(snapshot.board.cards[cardId]?.descriptionPreview).toBe("Ligar para o síndico antes das 18h");
    client.close();
  });

  it("save everything and close sessions when the server shuts down", async () => {
    const s = await server({ ...quick, saveDebounceMs: 60_000, sessionIdleMs: 60_000 });
    const { boardId, cookie, cardId } = await s.board();
    const { client, doc } = await s.open(boardId, cookie, cardId);
    await doc.until(() => doc.synced);
    doc.write("Salvo no desligamento");
    await new Promise((r) => setTimeout(r, 100));
    await s.app.close();
    expect((await client.closed).code).toBe(1012);
    const row = await stored(boardId, cardId);
    expect(row.descriptionText).toBe("Salvo no desligamento");
    expect(row.descriptionPreview).toBe("Salvo no desligamento");
  });

  it("stop accepting changes past the size guard, and say so", async () => {
    const s = await server();
    const { boardId, cookie, cardId } = await s.board();
    const { client, doc } = await s.open(boardId, cookie, cardId);
    await doc.until(() => doc.synced);
    doc.write("x".repeat(250));
    await doc.until(() => doc.denied !== null);
    expect(doc.denied).toBe("too_large");
    const again = new DocClient(client, cardId);
    again.subscribe();
    await again.until(() => again.denied === "too_large");
    client.close();
  });

  it("relay cursors, and remove them when their owner leaves", async () => {
    const s = await server();
    const { boardId, key, cookie, cardId } = await s.board();
    const ana = await s.open(boardId, cookie, cardId);
    const bruno = await s.open(boardId, await s.join(boardId, key, "Bruno"), cardId);
    await bruno.doc.until(() => bruno.doc.synced);
    ana.doc.awareness.setLocalStateField("user", { name: "Ana", color: "#2563eb" });
    const anaId = ana.doc.doc.clientID;
    await bruno.doc.until(() => bruno.doc.awareness.getStates().get(anaId)?.["user"]?.name === "Ana");
    ana.client.close();
    await bruno.doc.until(() => !bruno.doc.awareness.getStates().has(anaId));
    bruno.client.close();
  });
});
