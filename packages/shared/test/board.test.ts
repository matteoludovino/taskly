import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cardsIn, decide, sortedColumns, uuidv7, type BoardState, type Operation } from "../src";
import { apply, run, threeColumns } from "./helpers";

const titles = (state: BoardState, columnId: string) => cardsIn(state, columnId).map((c) => c.title);

function withCards(columnId: string, base: BoardState, ...names: string[]) {
  const ids: Record<string, string> = {};
  let state = base;
  for (const name of names) {
    ids[name] = uuidv7();
    state = apply(state, { type: "card.create", cardId: ids[name]!, columnId, title: name });
  }
  return { state, ids };
}

describe("columns", () => {
  it("are created in order and numbered events have no gaps", () => {
    const { state } = threeColumns();
    expect(sortedColumns(state).map((c) => c.title)).toEqual(["A fazer", "Fazendo", "Feito"]);
    expect(state.seq).toBe(3);
  });

  it("can be created at the start", () => {
    const { state } = threeColumns();
    const first = uuidv7();
    const next = apply(state, { type: "column.create", columnId: first, title: "Ideias", afterId: null });
    expect(sortedColumns(next)[0]?.id).toBe(first);
  });

  it("move between neighbours, and a move to where it already is changes nothing", () => {
    const { state, todo, doing, done } = threeColumns();
    const moved = apply(state, { type: "column.move", columnId: todo, afterId: done, beforeId: null });
    expect(sortedColumns(moved).map((c) => c.id)).toEqual([doing, done, todo]);
    expect(decide(state, { type: "column.move", columnId: doing, afterId: todo, beforeId: done }).kind).toBe(
      "noop",
    );
  });

  it("can only be deleted when empty", () => {
    const { state, todo } = threeColumns();
    const { state: full } = withCards(todo, state, "Comprar café");
    expect(decide(full, { type: "column.delete", columnId: todo })).toEqual({
      kind: "rejected",
      code: "column_not_empty",
    });
    const gone = apply(state, { type: "column.delete", columnId: todo });
    expect(gone.columns[todo]).toBeUndefined();
    expect(gone.deletedColumns[todo]).toBe("A fazer");
    // Deleting it again is what the person wanted anyway.
    expect(decide(gone, { type: "column.delete", columnId: todo }).kind).toBe("noop");
  });

  it("renaming to the same title is a no-op", () => {
    const { state, todo } = threeColumns();
    expect(decide(state, { type: "column.rename", columnId: todo, title: "A fazer" }).kind).toBe("noop");
  });
});

describe("cards", () => {
  it("are added at the end by default, or between the neighbours given", () => {
    const { state: base, todo } = threeColumns();
    const { state, ids } = withCards(todo, base, "um", "três");
    const between = apply(state, {
      type: "card.create",
      cardId: uuidv7(),
      columnId: todo,
      title: "dois",
      afterId: ids["um"]!,
      beforeId: ids["três"]!,
    });
    expect(titles(between, todo)).toEqual(["um", "dois", "três"]);
  });

  it("move across columns and record where they came from", () => {
    const { state: base, todo, doing } = threeColumns();
    const { state, ids } = withCards(todo, base, "um", "dois");
    const { state: moved, decision } = run(state, {
      type: "card.move",
      cardId: ids["um"]!,
      toColumnId: doing,
      afterId: null,
      beforeId: null,
    });
    expect(titles(moved, todo)).toEqual(["dois"]);
    expect(titles(moved, doing)).toEqual(["um"]);
    expect(decision).toMatchObject({
      kind: "event",
      event: { type: "card.moved", payload: { fromColumnTitle: "A fazer", toColumnTitle: "Fazendo" } },
    });
  });

  it("reorder within a column; dropping in place is a no-op", () => {
    const { state: base, todo } = threeColumns();
    const { state, ids } = withCards(todo, base, "um", "dois", "três");
    const moved = apply(state, {
      type: "card.move",
      cardId: ids["três"]!,
      toColumnId: todo,
      afterId: null,
      beforeId: ids["um"]!,
    });
    expect(titles(moved, todo)).toEqual(["três", "um", "dois"]);
    const inPlace = decide(state, {
      type: "card.move",
      cardId: ids["dois"]!,
      toColumnId: todo,
      afterId: ids["um"]!,
      beforeId: ids["três"]!,
    });
    expect(inPlace.kind).toBe("noop");
  });

  it("record who changed each field and when", () => {
    const { state: base, todo } = threeColumns();
    const { state, ids } = withCards(todo, base, "um");
    const { state: next } = run(
      state,
      { type: "card.update", cardId: ids["um"]!, change: { field: "priority", value: "high" } },
      "bruno",
    );
    const card = next.cards[ids["um"]!]!;
    expect(card.priority).toBe("high");
    expect(card.versions.priority).toEqual({ seq: next.seq, by: "bruno" });
    expect(card.versions.title).toEqual({ seq: state.seq, by: "ana" });
  });

  it("setting a field to its current value is a no-op", () => {
    const { state: base, todo } = threeColumns();
    const { state, ids } = withCards(todo, base, "um");
    const op: Operation = {
      type: "card.update",
      cardId: ids["um"]!,
      change: { field: "completed", value: false },
    };
    expect(decide(state, op).kind).toBe("noop");
  });

  it("a delete wins over a later move or edit", () => {
    const { state: base, todo, doing } = threeColumns();
    const { state, ids } = withCards(todo, base, "um");
    const cardId = ids["um"]!;
    const deleted = apply(state, { type: "card.delete", cardId });
    expect(decide(deleted, { type: "card.update", cardId, change: { field: "title", value: "x" } })).toEqual({
      kind: "rejected",
      code: "deleted",
    });
    expect(
      decide(deleted, { type: "card.move", cardId, toColumnId: doing, afterId: null, beforeId: null }),
    ).toEqual({
      kind: "rejected",
      code: "deleted",
    });
    expect(decide(deleted, { type: "card.delete", cardId }).kind).toBe("noop");
  });

  it("cannot land in a deleted column", () => {
    const { state, todo, doing } = threeColumns();
    const { state: withCard, ids } = withCards(todo, state, "um");
    const gone = apply(withCard, { type: "column.delete", columnId: doing });
    expect(
      decide(gone, {
        type: "card.move",
        cardId: ids["um"]!,
        toColumnId: doing,
        afterId: null,
        beforeId: null,
      }),
    ).toEqual({ kind: "rejected", code: "column_deleted" });
    expect(decide(gone, { type: "card.create", cardId: uuidv7(), columnId: doing, title: "x" })).toEqual({
      kind: "rejected",
      code: "column_deleted",
    });
  });

  it("reject ids that are taken or unknown", () => {
    const { state: base, todo } = threeColumns();
    const { state, ids } = withCards(todo, base, "um");
    expect(
      decide(state, { type: "card.create", cardId: ids["um"]!, columnId: todo, title: "de novo" }),
    ).toEqual({
      kind: "rejected",
      code: "exists",
    });
    expect(decide(state, { type: "card.delete", cardId: uuidv7() })).toEqual({
      kind: "rejected",
      code: "not_found",
    });
  });
});

describe("any sequence of operations", () => {
  // Operations drawn against a small pool of ids, so they collide: moves into deleted columns, edits of
  // deleted cards, cards dropped into the same gap.
  const pool = {
    columns: Array.from({ length: 4 }, () => uuidv7()),
    cards: Array.from({ length: 8 }, () => uuidv7()),
  };
  const col = fc.constantFrom(...pool.columns);
  const card = fc.constantFrom(...pool.cards);
  const neighbour = fc.option(fc.constantFrom(...pool.cards, ...pool.columns), { nil: null });
  const op: fc.Arbitrary<Operation> = fc.oneof(
    fc.record({ type: fc.constant("column.create" as const), columnId: col, title: fc.constant("Coluna") }),
    fc.record({ type: fc.constant("column.delete" as const), columnId: col }),
    fc.record({
      type: fc.constant("column.move" as const),
      columnId: col,
      afterId: neighbour,
      beforeId: neighbour,
    }),
    fc.record({
      type: fc.constant("card.create" as const),
      cardId: card,
      columnId: col,
      title: fc.constant("Cartão"),
      afterId: neighbour,
      beforeId: neighbour,
    }),
    fc.record({
      type: fc.constant("card.move" as const),
      cardId: card,
      toColumnId: col,
      afterId: neighbour,
      beforeId: neighbour,
    }),
    fc.record({ type: fc.constant("card.delete" as const), cardId: card }),
    fc.record({
      type: fc.constant("card.update" as const),
      cardId: card,
      change: fc.constant({ field: "title" as const, value: "Novo título" }),
    }),
  );

  it("keeps the board consistent", () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 80 }), (ops) => {
        let state = threeColumns().state;
        for (const operation of ops) {
          const before = state.seq;
          state = run(state, operation).state;
          expect(state.seq - before).toBeLessThanOrEqual(1);
        }
        const columns = sortedColumns(state);
        expect(new Set(columns.map((c) => c.position)).size).toBe(columns.length);
        for (const column of columns) {
          const cards = cardsIn(state, column.id);
          expect(new Set(cards.map((c) => c.position)).size).toBe(cards.length);
        }
        // Every card sits in a column that exists.
        for (const c of Object.values(state.cards)) expect(state.columns[c.columnId]).toBeDefined();
      }),
    );
  });
});
