import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  sortedColumns,
  uuidv7,
  type BoardSnapshot,
  type CreateBoardResponse,
  type OpResult,
} from "@taskly/shared";
import { ORIGIN, testApp, testDb } from "./support.ts";

const db = testDb();
const app = await testApp(db);
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

type Injected = Awaited<ReturnType<typeof app.inject>>;
const cookieOf = (response: Injected) => {
  const header = response.headers["set-cookie"];
  return (Array.isArray(header) ? header[0] : header)!;
};
const asCookie = (setCookie: string) => setCookie.split(";")[0]!;

function post(url: string, body: unknown, cookie?: string, origin: string | null = ORIGIN) {
  return app.inject({
    method: "POST",
    url,
    payload: body as object,
    headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) },
  });
}

async function newBoard(name = "Ana") {
  const response = await post("/api/boards", { title: "Sprint 1", name, color: "#2563eb" });
  expect(response.statusCode).toBe(201);
  return {
    ...response.json<CreateBoardResponse>(),
    cookie: asCookie(cookieOf(response)),
    setCookie: cookieOf(response),
  };
}

describe("creating a board", () => {
  let created: Awaited<ReturnType<typeof newBoard>>;
  beforeAll(async () => {
    created = await newBoard();
  });

  it("returns a short public id, a long secret key and a cookie scoped to the board", () => {
    expect(created.boardId).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(created.key.length).toBeGreaterThanOrEqual(43);
    expect(created.setCookie).toContain(`Path=/api/boards/${created.boardId}`);
    expect(created.setCookie).toContain("HttpOnly");
    expect(created.setCookie).toContain("SameSite=Lax");
  });

  it("starts with three columns and its creator, all in the history", async () => {
    const response = await app.inject({
      url: `/api/boards/${created.boardId}`,
      headers: { cookie: created.cookie },
    });
    const { board, me } = response.json<BoardSnapshot>();
    expect(sortedColumns(board).map((c) => c.title)).toEqual(["A fazer", "Fazendo", "Feito"]);
    expect(me).toMatchObject({ name: "Ana", color: "#2563eb" });
    expect(board.seq).toBe(4);
    const events = await db.boardEvent.findMany({
      where: { boardId: created.boardId },
      orderBy: { seq: "asc" },
    });
    expect(events.map((e) => e.type)).toEqual([
      "participant.joined",
      "column.created",
      "column.created",
      "column.created",
    ]);
  });

  it("stores only hashes of the key and the participant token", async () => {
    const board = await db.board.findUniqueOrThrow({ where: { id: created.boardId } });
    expect(Buffer.from(board.keyHash).toString("base64url")).not.toBe(created.key);
    expect(
      JSON.stringify(await db.participant.findMany({ where: { boardId: created.boardId } })),
    ).not.toContain(created.cookie.split("=")[1]);
  });

  it("validates the input", async () => {
    const response = await post("/api/boards", { title: "", name: "Ana", color: "#2563eb" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "invalid", message: "Dados inválidos." } });
    expect((await post("/api/boards", { title: "x", name: "Ana", color: "red" })).statusCode).toBe(400);
  });
});

describe("joining", () => {
  it("lets in whoever has the key", async () => {
    const { boardId, key } = await newBoard();
    const response = await post(`/api/boards/${boardId}/join`, { key, name: "Bruno", color: "#db2777" });
    expect(response.statusCode).toBe(200);
    const snapshot = await app.inject({
      url: `/api/boards/${boardId}`,
      headers: { cookie: asCookie(cookieOf(response)) },
    });
    const { board, me } = snapshot.json<BoardSnapshot>();
    expect(me.name).toBe("Bruno");
    expect(Object.values(board.participants).map((p) => p.name)).toEqual(["Ana", "Bruno"]);
  });

  it("turns away a wrong key and an unknown board the same way", async () => {
    const { boardId } = await newBoard();
    const wrongKey = await post(`/api/boards/${boardId}/join`, {
      key: "x".repeat(43),
      name: "Eva",
      color: "#db2777",
    });
    const noBoard = await post(`/api/boards/ZZZZZZZZZZ/join`, {
      key: "x".repeat(43),
      name: "Eva",
      color: "#db2777",
    });
    expect(wrongKey.statusCode).toBe(403);
    expect(noBoard.statusCode).toBe(403);
    expect(wrongKey.json()).toEqual(noBoard.json());
  });
});

describe("access", () => {
  it("needs the board's own cookie", async () => {
    const a = await newBoard();
    const b = await newBoard();
    expect((await app.inject({ url: `/api/boards/${a.boardId}` })).statusCode).toBe(401);
    // Board B's token on board A (forcing the cookie onto the wrong path).
    const crossed = await app.inject({ url: `/api/boards/${a.boardId}`, headers: { cookie: b.cookie } });
    expect(crossed.statusCode).toBe(401);
    expect(crossed.json().error.code).toBe("not_joined");
  });

  it("refuses changes from other origins, or with no origin", async () => {
    const { boardId, cookie } = await newBoard();
    const op = { clientOpId: uuidv7(), op: { type: "board.rename", title: "Hackeado" } };
    expect((await post(`/api/boards/${boardId}/ops`, op, cookie, "https://evil.example")).statusCode).toBe(
      403,
    );
    expect((await post(`/api/boards/${boardId}/ops`, op, cookie, null)).statusCode).toBe(403);
    expect(
      (await post("/api/boards", { title: "x", name: "y", color: "#2563eb" }, undefined, null)).statusCode,
    ).toBe(403);
  });

  it("answers 404 for malformed board ids", async () => {
    expect((await app.inject({ url: "/api/boards/../../etc" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/boards/short" })).statusCode).toBe(404);
  });
});

describe("operations", () => {
  it("apply, answer with the event, and are idempotent", async () => {
    const { boardId, cookie } = await newBoard();
    const columns = sortedColumns(
      (await app.inject({ url: `/api/boards/${boardId}`, headers: { cookie } })).json<BoardSnapshot>().board,
    );
    const body = {
      clientOpId: uuidv7(),
      op: { type: "card.create", cardId: uuidv7(), columnId: columns[0]!.id, title: "Escrever testes" },
    };
    const first = (await post(`/api/boards/${boardId}/ops`, body, cookie)).json<OpResult>();
    expect(first).toMatchObject({ result: "applied", event: { seq: 5, type: "card.created" } });
    const again = (await post(`/api/boards/${boardId}/ops`, body, cookie)).json<OpResult>();
    expect(again).toEqual(first);
  });

  it("report rejections with a reason", async () => {
    const { boardId, cookie } = await newBoard();
    const body = { clientOpId: uuidv7(), op: { type: "card.delete", cardId: uuidv7() } };
    expect((await post(`/api/boards/${boardId}/ops`, body, cookie)).json()).toEqual({
      result: "rejected",
      code: "not_found",
      seq: 4,
    });
  });

  it("reject malformed operations", async () => {
    const { boardId, cookie } = await newBoard();
    const response = await post(
      `/api/boards/${boardId}/ops`,
      { clientOpId: uuidv7(), op: { type: "drop.table" } },
      cookie,
    );
    expect(response.statusCode).toBe(400);
  });
});

describe("rate limits", () => {
  it("slow down repeated attempts to join", async () => {
    const limited = await testApp(db);
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const response = await limited.inject({
        method: "POST",
        url: "/api/boards/ZZZZZZZZZZ/join",
        payload: { key: "x".repeat(43), name: "Eva", color: "#db2777" },
        headers: { origin: ORIGIN },
      });
      statuses.push(response.statusCode);
      if (i === 30) expect(response.json().error.code).toBe("rate_limited");
    }
    expect(statuses.slice(0, 30).every((s) => s === 403)).toBe(true);
    expect(statuses[30]).toBe(429);
    await limited.close();
  });
});
