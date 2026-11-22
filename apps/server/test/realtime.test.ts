import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLOSE,
  PROTOCOL_VERSION,
  sortedColumns,
  uuidv7,
  type BoardSnapshot,
  type CreateBoardResponse,
  type Operation,
  type TicketResponse,
} from "@taskly/shared";
import { buildApp } from "../src/app.ts";
import { ORIGIN, testDb } from "./support.ts";
import { is, TestClient } from "./ws-client.ts";

const db = testDb();
const app = await buildApp({
  db,
  origins: [ORIGIN],
  realtime: { snapshotAfter: 10, heartbeatMs: 200, ticketTtlMs: 1000 },
});
let base = "";

beforeAll(async () => {
  await app.listen({ port: 0, host: "127.0.0.1" });
  base = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`;
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const headers = (cookie?: string) => ({ origin: ORIGIN, ...(cookie ? { cookie } : {}) });

async function newBoard(name = "Ana") {
  const response = await app.inject({
    method: "POST",
    url: "/api/boards",
    headers: headers(),
    payload: { title: "Ao vivo", name, color: "#2563eb" },
  });
  const { boardId, key } = response.json<CreateBoardResponse>();
  const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
  const snapshot = (
    await app.inject({ url: `/api/boards/${boardId}`, headers: headers(cookie) })
  ).json<BoardSnapshot>();
  return { boardId, key, cookie, columns: sortedColumns(snapshot.board).map((c) => c.id), me: snapshot.me };
}

async function join(boardId: string, key: string, name: string) {
  const response = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/join`,
    headers: headers(),
    payload: { key, name, color: "#db2777" },
  });
  return String(response.headers["set-cookie"]).split(";")[0]!;
}

async function ticket(boardId: string, cookie: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/ticket`,
    headers: headers(cookie),
  });
  const { url } = response.json<TicketResponse>();
  return `${base}${new URL(url).search}`;
}

async function connect(boardId: string, cookie: string, lastSeq: number) {
  const client = await TestClient.open(await ticket(boardId, cookie), ORIGIN);
  client.hello(lastSeq);
  await client.until(is("synced"));
  return client;
}

const rest = (boardId: string, cookie: string, op: Operation) =>
  app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/ops`,
    headers: headers(cookie),
    payload: { clientOpId: uuidv7(), op },
  });

const newCard = (columnId: string, title: string): Operation => ({
  type: "card.create",
  cardId: uuidv7(),
  columnId,
  title,
});

describe("handshake", () => {
  it("needs a ticket, from this board's participant, once, before it expires, from an allowed origin", async () => {
    const { boardId, cookie } = await newBoard();
    await expect(TestClient.open(base, ORIGIN)).rejects.toThrow("HTTP 401");
    const url = await ticket(boardId, cookie);
    await expect(TestClient.open(url, "https://evil.example")).rejects.toThrow("HTTP 403");
    const first = await TestClient.open(url, ORIGIN);
    await expect(TestClient.open(url, ORIGIN)).rejects.toThrow("HTTP 401");
    first.close();
    const late = await ticket(boardId, cookie);
    await new Promise((r) => setTimeout(r, 1100));
    await expect(TestClient.open(late, ORIGIN)).rejects.toThrow("HTTP 401");
  });

  it("won't hand out tickets without the board's cookie", async () => {
    const { boardId } = await newBoard();
    const other = await newBoard();
    const response = await app.inject({
      method: "POST",
      url: `/api/boards/${boardId}/ticket`,
      headers: headers(other.cookie),
    });
    expect(response.statusCode).toBe(401);
  });

  it("tells outdated clients to reload", async () => {
    const { boardId, cookie } = await newBoard();
    const client = await TestClient.open(await ticket(boardId, cookie), ORIGIN);
    client.hello(0, PROTOCOL_VERSION - 2);
    expect((await client.closed).code).toBe(CLOSE.outdated);
  });

  it("closes on anything but protocol messages", async () => {
    const { boardId, cookie } = await newBoard();
    const client = await TestClient.open(await ticket(boardId, cookie), ORIGIN);
    client.send({ t: "drop", table: "boards" });
    expect((await client.closed).code).toBe(CLOSE.violation);
    const early = await TestClient.open(await ticket(boardId, cookie), ORIGIN);
    early.send({ t: "pull", fromSeq: 0 });
    expect((await early.closed).code).toBe(CLOSE.violation);
    const huge = await TestClient.open(await ticket(boardId, cookie), ORIGIN);
    huge.ws.send("x".repeat(70 * 1024));
    expect((await huge.closed).code).toBe(CLOSE.violation);
  });
});

describe("catching up", () => {
  it("replays what the client missed, then says synced", async () => {
    const { boardId, cookie } = await newBoard(); // events 1–4: join + three columns
    const client = await connect(boardId, cookie, 2);
    expect(client.eventSeqs()).toEqual([3, 4]);
    expect(client.received.find(is("synced"))).toEqual({ t: "synced", seq: 4 });
    client.close();
  });

  it("sends a snapshot when that's shorter", async () => {
    const { boardId, cookie, columns } = await newBoard();
    for (let i = 0; i < 12; i++) await rest(boardId, cookie, newCard(columns[0]!, `${i}`));
    const client = await connect(boardId, cookie, 0);
    const snapshot = client.received.find(is("snapshot"));
    expect(snapshot?.board.seq).toBe(16);
    expect(client.eventSeqs()).toEqual([]);
    client.close();
  });

  it("loses no event between the catch-up and the subscription", async () => {
    const { boardId, cookie, columns } = await newBoard();
    // Writes keep landing while the client connects.
    const writes = (async () => {
      for (let i = 0; i < 30; i++) await rest(boardId, cookie, newCard(columns[0]!, `${i}`));
    })();
    await new Promise((r) => setTimeout(r, 30));
    const client = await TestClient.open(await ticket(boardId, cookie), ORIGIN);
    client.hello(4);
    await writes;
    await client.until((m): m is never => m.t === "event" && m.event.seq === 34);
    expect(client.eventSeqs()).toEqual(Array.from({ length: 30 }, (_, i) => i + 5));
    client.close();
  });

  it("fills a gap on request (pull)", async () => {
    const { boardId, cookie } = await newBoard();
    const client = await connect(boardId, cookie, 4);
    const from = client.received.length;
    client.send({ t: "pull", fromSeq: 1 });
    await client.until((m): m is never => m.t === "event" && m.event.seq === 4, from);
    expect(client.eventSeqs()).toEqual([2, 3, 4]);
    client.close();
  });
});

describe("live", () => {
  it("broadcasts each event to everyone, and acks the sender after its event", async () => {
    const { boardId, key, cookie, columns } = await newBoard();
    const ana = await connect(boardId, cookie, 4);
    const bruno = await connect(boardId, await join(boardId, key, "Bruno"), 5);
    const clientOpId = uuidv7();
    ana.send({ t: "op", clientOpId, op: newCard(columns[0]!, "Ao vivo") });
    const ack = await ana.until(is("ack"));
    const seen = await bruno.until(is("event"));
    expect(ack.result).toMatchObject({ result: "applied", event: { seq: 6, clientOpId } });
    expect(seen.event).toEqual(ack.result.result === "applied" ? ack.result.event : null);
    const order = ana.received.map((m) => m.t).filter((t) => t === "event" || t === "ack");
    expect(order.slice(-2)).toEqual(["event", "ack"]);
    ana.close();
    bruno.close();
  });

  it("delivers the same gapless order to everyone under concurrent REST and WebSocket writes", async () => {
    const { boardId, key, cookie, columns } = await newBoard();
    const clients = [
      await connect(boardId, cookie, 4),
      await connect(boardId, await join(boardId, key, "Bruno"), 4),
      await connect(boardId, await join(boardId, key, "Carla"), 4),
    ];
    const final = 6 + 60; // two joins, then 3 × 15 over WebSocket and 15 over REST
    await Promise.all([
      ...clients.map(async (client, i) => {
        for (let n = 0; n < 15; n++)
          client.send({ t: "op", clientOpId: uuidv7(), op: newCard(columns[i]!, `${i}-${n}`) });
      }),
      Promise.all(
        Array.from({ length: 15 }, (_, n) => rest(boardId, cookie, newCard(columns[0]!, `rest-${n}`))),
      ),
    ]);
    for (const client of clients) {
      await client.until((m): m is never => m.t === "event" && m.event.seq === final);
      expect(client.eventSeqs()).toEqual(Array.from({ length: final - 4 }, (_, i) => i + 5));
    }
    clients.forEach((c) => c.close());
  });

  it("applies a resent operation once and acks both copies with the same event", async () => {
    const { boardId, cookie, columns } = await newBoard();
    const client = await connect(boardId, cookie, 4);
    const message = { t: "op" as const, clientOpId: uuidv7(), op: newCard(columns[0]!, "uma vez") };
    client.send(message);
    client.send(message);
    await client.until(is("ack"));
    const acks = await (async () => {
      for (;;) {
        const all = client.received.filter(is("ack"));
        if (all.length === 2) return all;
        await new Promise((r) => setTimeout(r, 20));
      }
    })();
    expect(acks[0]).toEqual(acks[1]);
    expect(client.eventSeqs()).toEqual([5]);
    client.close();
  });

  it("applies a create and a rename sent back to back, in order", async () => {
    const { boardId, cookie, columns } = await newBoard();
    const client = await connect(boardId, cookie, 4);
    const cardId = uuidv7();
    client.send({
      t: "op",
      clientOpId: uuidv7(),
      op: { type: "card.create", cardId, columnId: columns[0]!, title: "a" },
    });
    client.send({
      t: "op",
      clientOpId: uuidv7(),
      op: { type: "card.update", cardId, change: { field: "title", value: "b" } },
    });
    await client.until((m): m is never => m.t === "event" && m.event.seq === 6);
    expect(client.received.filter(is("ack")).map((a) => a.result.result)).toEqual(["applied", "applied"]);
    client.close();
  });
});

describe("presence", () => {
  it("tracks who has the board open, counting several tabs once", async () => {
    const { boardId, key, cookie, me } = await newBoard();
    const ana = await connect(boardId, cookie, 4);
    await ana.until((m): m is never => m.t === "presence" && m.online.length === 1);
    const brunoCookie = await join(boardId, key, "Bruno");
    const bruno = await connect(boardId, brunoCookie, 5);
    const both = await ana.until(
      (m): m is Extract<typeof m, { t: "presence" }> => m.t === "presence" && m.online.length === 2,
    );
    expect(both.online).toContain(me.id);
    const secondTab = await connect(boardId, cookie, 5);
    const from = ana.received.length;
    secondTab.close();
    bruno.close();
    const alone = await ana.until(
      (m): m is Extract<typeof m, { t: "presence" }> => m.t === "presence" && m.online.length === 1,
      from,
    );
    expect(alone.online).toEqual([me.id]);
    ana.close();
  });
});

describe("liveness", () => {
  it("drops connections that stop answering pings", async () => {
    const { boardId, cookie } = await newBoard();
    const client = await TestClient.open(await ticket(boardId, cookie), ORIGIN, { autoPong: false });
    client.hello(4);
    expect((await client.closed).code).toBe(1006);
  });

  it("asks everyone to come back right away when the server restarts", async () => {
    const own = await buildApp({ db, origins: [ORIGIN] });
    await own.listen({ port: 0, host: "127.0.0.1" });
    const create = await own.inject({
      method: "POST",
      url: "/api/boards",
      headers: headers(),
      payload: { title: "x", name: "y", color: "#2563eb" },
    });
    const { boardId } = create.json<CreateBoardResponse>();
    const cookie = String(create.headers["set-cookie"]).split(";")[0]!;
    const { url } = (
      await own.inject({ method: "POST", url: `/api/boards/${boardId}/ticket`, headers: headers(cookie) })
    ).json<TicketResponse>();
    const port = (own.server.address() as AddressInfo).port;
    const client = await TestClient.open(`ws://127.0.0.1:${port}/ws${new URL(url).search}`, ORIGIN);
    client.hello(4);
    await client.until(is("synced"));
    await own.close();
    expect((await client.closed).code).toBe(CLOSE.restarting);
  });
});
