import { afterAll, describe, expect, it } from "vitest";
import {
  cardsIn,
  sortedColumns,
  type BoardSnapshot,
  type CreateBoardResponse,
  type HistoryPage,
} from "@taskly/shared";
import { buildApp } from "../src/app.ts";
import { removeExpiredBoards } from "../src/boards/cleanup.ts";
import { BoardStore } from "../src/boards/store.ts";
import { bareBoard, ORIGIN, testDb } from "./support.ts";

const db = testDb();
afterAll(() => db.$disconnect());

async function demo(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({ method: "POST", url: "/api/demo", headers: { origin: ORIGIN } });
  return { response, cookie: String(response.headers["set-cookie"]).split(";")[0]! };
}

describe("demo boards", () => {
  it("give each visitor a ready board, set up by a simulated teammate, that expires in a day", async () => {
    const app = await buildApp({ db, origins: [ORIGIN] });
    const { response, cookie } = await demo(app);
    expect(response.statusCode).toBe(201);
    const { boardId } = response.json<CreateBoardResponse>();
    const { board, me, expiresAt } = (
      await app.inject({ url: `/api/boards/${boardId}`, headers: { cookie } })
    ).json<BoardSnapshot>();

    expect(me).toMatchObject({ name: "Visitante" });
    expect(Object.values(board.participants).find((p) => p.simulated)?.name).toBe("Bia (simulada)");
    expect(sortedColumns(board).map((c) => c.title)).toEqual(["A fazer", "Fazendo", "Feito"]);
    const todo = cardsIn(board, sortedColumns(board)[0]!.id);
    expect(todo.map((c) => c.title)).toContain("Testar em um Android antigo");
    expect(todo.find((c) => c.title === "Testar em um Android antigo")?.descriptionPreview).toMatch(
      /^Aparelhos/,
    );
    const hours = (new Date(expiresAt!).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);

    // Its history already tells the story: Bia set it up, then the visitor joined.
    const history = (
      await app.inject({ url: `/api/boards/${boardId}/events?limit=2`, headers: { cookie } })
    ).json<HistoryPage>();
    expect(history.events[0]).toMatchObject({ type: "participant.joined", payload: { name: "Visitante" } });
    await app.close();
  });

  it("are capped, so a burst of visitors can't fill the database", async () => {
    const live = await db.board.count({ where: { expiresAt: { gt: new Date() } } });
    const app = await buildApp({ db, origins: [ORIGIN], demoMax: live + 1 });
    expect((await demo(app)).response.statusCode).toBe(201);
    const full = await demo(app);
    expect(full.response.statusCode).toBe(503);
    expect(full.response.json().error.code).toBe("demo_full");
    await app.close();
  });
});

describe("cleanup", () => {
  it("removes expired demo boards and long-idle ones, and nothing else", async () => {
    const store = new BoardStore(db);
    const now = new Date();
    const expired = await bareBoard(db);
    const idle = await bareBoard(db);
    const fresh = await bareBoard(db);
    const tomorrow = await bareBoard(db);
    await db.board.update({ where: { id: expired }, data: { expiresAt: new Date(now.getTime() - 1000) } });
    await db.board.update({
      where: { id: idle },
      data: { lastActivityAt: new Date(now.getTime() - 61 * 86_400_000) },
    });
    await db.board.update({
      where: { id: tomorrow },
      data: { expiresAt: new Date(now.getTime() + 86_400_000) },
    });
    await removeExpiredBoards(db, store, now);
    const left = (await db.board.findMany({ where: { id: { in: [expired, idle, fresh, tomorrow] } } })).map(
      (b) => b.id,
    );
    expect(left.sort()).toEqual([fresh, tomorrow].sort());
  });
});
