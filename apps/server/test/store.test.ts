import { afterAll, describe, expect, it } from "vitest";
import {
  cardsIn,
  sortedColumns,
  uuidv7,
  type BoardEvent,
  type Operation,
  type OpResult,
} from "@taskly/shared";
import { BoardNotFound, BoardStore } from "../src/boards/store.ts";
import { loadBoard } from "../src/boards/snapshot.ts";
import { bareBoard, op, testDb } from "./support.ts";

const db = testDb();
afterAll(() => db.$disconnect());

const ana = uuidv7();
const applied = (result: OpResult): BoardEvent => {
  if (result.result !== "applied") throw new Error(`expected an event, got ${JSON.stringify(result)}`);
  return result.event;
};

async function boardWithColumn(store: BoardStore) {
  const boardId = await bareBoard(db);
  const columnId = uuidv7();
  applied(await store.apply(boardId, ana, op({ type: "column.create", columnId, title: "A fazer" })));
  return { boardId, columnId };
}

describe("BoardStore", () => {
  it("numbers events 1, 2, 3… with no gaps, even under concurrent writes", async () => {
    const store = new BoardStore(db);
    const { boardId, columnId } = await boardWithColumn(store);
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        store.apply(
          boardId,
          ana,
          op({ type: "card.create", cardId: uuidv7(), columnId, title: `Cartão ${i}` }),
        ),
      ),
    );
    const seqs = results.map((r) => applied(r).seq);
    // Committed in arrival order: each write got the next number.
    expect(seqs).toEqual(Array.from({ length: 30 }, (_, i) => i + 2));
    const rows = await db.boardEvent.findMany({
      where: { boardId },
      orderBy: { seq: "asc" },
      select: { seq: true },
    });
    expect(rows.map((r) => r.seq)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect((await db.board.findUniqueOrThrow({ where: { id: boardId } })).seq).toBe(31);
  });

  it("applies a resent operation once and answers with the original event", async () => {
    const store = new BoardStore(db);
    const { boardId, columnId } = await boardWithColumn(store);
    const envelope = op({ type: "card.create", cardId: uuidv7(), columnId, title: "Uma vez só" });
    const first = applied(await store.apply(boardId, ana, envelope));
    const again = applied(await store.apply(boardId, ana, envelope));
    expect(again).toEqual(first);
    // Even from a fresh process (nothing in memory).
    const restarted = applied(await new BoardStore(db).apply(boardId, ana, envelope));
    expect(restarted).toEqual(first);
    expect(await db.boardEvent.count({ where: { boardId } })).toBe(2);
  });

  it("spends no number on no-ops and rejections", async () => {
    const store = new BoardStore(db);
    const { boardId, columnId } = await boardWithColumn(store);
    expect(
      await store.apply(boardId, ana, op({ type: "column.rename", columnId, title: "A fazer" })),
    ).toEqual({
      result: "noop",
      seq: 1,
    });
    expect(await store.apply(boardId, ana, op({ type: "card.delete", cardId: uuidv7() }))).toEqual({
      result: "rejected",
      code: "not_found",
      seq: 1,
    });
    const next = applied(
      await store.apply(boardId, ana, op({ type: "column.rename", columnId, title: "Backlog" })),
    );
    expect(next.seq).toBe(2);
  });

  it("persists exactly what it holds in memory", async () => {
    const store = new BoardStore(db);
    const { boardId, columnId: todo } = await boardWithColumn(store);
    const doing = uuidv7();
    const [a, b, c, e] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
    const ops: Operation[] = [
      { type: "board.rename", title: "Sprint 12" },
      { type: "column.create", columnId: doing, title: "Fazendo" },
      { type: "card.create", cardId: a, columnId: todo, title: "a" },
      { type: "card.create", cardId: b, columnId: todo, title: "b", afterId: null },
      { type: "card.create", cardId: c, columnId: todo, title: "c", afterId: b, beforeId: a },
      { type: "card.update", cardId: a, change: { field: "priority", value: "high" } },
      { type: "card.update", cardId: a, change: { field: "dueDate", value: "2026-12-24" } },
      { type: "card.update", cardId: b, change: { field: "completed", value: true } },
      { type: "card.move", cardId: a, toColumnId: doing, afterId: null, beforeId: null },
      { type: "card.delete", cardId: c },
      { type: "card.create", cardId: e, columnId: todo, title: "e" },
      { type: "card.update", cardId: e, change: { field: "priority", value: "low" } },
      { type: "card.delete", cardId: e },
      { type: "card.restore", cardId: e, columnId: doing },
      { type: "column.move", columnId: doing, afterId: null, beforeId: todo },
      { type: "column.rename", columnId: todo, title: "Backlog" },
    ];
    for (const operation of ops) applied(await store.apply(boardId, ana, op(operation)));

    const inMemory = await store.get(boardId);
    const fromDb = await loadBoard(db, boardId);
    expect(fromDb).toEqual(inMemory);
    expect(sortedColumns(fromDb!).map((col) => col.title)).toEqual(["Fazendo", "Backlog"]);
    expect(cardsIn(fromDb!, todo).map((card) => card.title)).toEqual(["b"]);
    expect(fromDb!.cards[a]).toMatchObject({ columnId: doing, priority: "high", dueDate: "2026-12-24" });
    expect(Object.keys(fromDb!.deletedCards)).toEqual([c]);
    expect(fromDb!.deletedCards[c]).toMatchObject({ title: "c", position: "" });
  });

  it("recovers when another writer took the next number", async () => {
    const store = new BoardStore(db);
    const { boardId, columnId } = await boardWithColumn(store);
    // Behind the store's back: event 2 and the matching seq, as another instance would write them.
    await db.$transaction([
      db.boardEvent.create({
        data: {
          boardId,
          seq: 2,
          type: "board.renamed",
          payload: { title: "Outro nome", previousTitle: "Quadro de teste" },
        },
      }),
      db.board.update({ where: { id: boardId }, data: { seq: 2, title: "Outro nome" } }),
    ]);
    const event = applied(
      await store.apply(
        boardId,
        ana,
        op({ type: "card.create", cardId: uuidv7(), columnId, title: "depois" }),
      ),
    );
    expect(event.seq).toBe(3);
    expect((await store.get(boardId))?.title).toBe("Outro nome");
  });

  it("says so when the board doesn't exist", async () => {
    const store = new BoardStore(db);
    expect(await store.get("nope")).toBeNull();
    await expect(store.apply("nope", ana, op({ type: "board.rename", title: "x" }))).rejects.toBeInstanceOf(
      BoardNotFound,
    );
  });
});
