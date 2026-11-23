import { describe, expect, it } from "vitest";
import {
  applyEvent,
  decide,
  emptyBoard,
  uuidv7,
  type BoardState,
  type Operation,
  type Rejection,
} from "@taskly/shared";
import { addToTray, resolve, trayItemFor } from "./conflicts";

function apply(state: BoardState, op: Operation, actor = "ana"): BoardState {
  const d = decide(state, op, actor);
  if (d.kind !== "event") throw new Error(`${op.type}: ${d.kind}`);
  return applyEvent(state, { ...d.event, seq: state.seq + 1, actorId: actor });
}

function board() {
  const [todo, doing, cardId] = [uuidv7(), uuidv7(), uuidv7()];
  let state = emptyBoard("b", "Quadro");
  state = apply(state, { type: "column.create", columnId: todo, title: "A fazer" });
  state = apply(state, { type: "column.create", columnId: doing, title: "Fazendo" });
  state = apply(state, { type: "card.create", cardId, columnId: todo, title: "Cartão" });
  return { state, todo, doing, cardId };
}

const reject = (op: Operation, code: Rejection["code"], conflict?: Rejection["conflict"]): Rejection => ({
  clientOpId: uuidv7(),
  code,
  op,
  ...(conflict ? { conflict } : {}),
});

describe("conflict tray", () => {
  it("offers keep-mine for a field someone else changed, as an edit based on the current version", () => {
    const { state, cardId } = board();
    const theirs = apply(
      state,
      { type: "card.update", cardId, change: { field: "priority", value: "high" } },
      "bruno",
    );
    const item = trayItemFor(
      reject(
        { type: "card.update", cardId, change: { field: "priority", value: "low" }, baseSeq: 3 },
        "conflict",
        {
          field: "priority",
          theirs: "high",
          by: "bruno",
          version: theirs.seq,
        },
      ),
    )!;
    expect(item).toMatchObject({ kind: "field", mine: "low", theirs: "high", by: "bruno" });
    const ops = resolve(item, "mine", theirs);
    expect(ops).toEqual([
      { type: "card.update", cardId, change: { field: "priority", value: "low" }, baseSeq: theirs.seq },
    ]);
    // And the server would accept it.
    expect(decide(theirs, ops[0]!, "ana").kind).toBe("event");
    expect(resolve(item, "theirs", theirs)).toEqual([]);
  });

  it("keeps one item per card field, the latest", () => {
    const op = (value: string): Operation => ({
      type: "card.update",
      cardId: "c",
      change: { field: "title", value },
    });
    const conflict = { field: "title" as const, theirs: "x", by: "bruno", version: 9 };
    const first = trayItemFor(reject(op("a"), "conflict", conflict))!;
    const second = trayItemFor(reject(op("b"), "conflict", conflict))!;
    expect(addToTray(addToTray([], first), second)).toEqual([second]);
  });

  it("restores a deleted card in its old column and re-applies the change", () => {
    const { state, cardId, todo } = board();
    const deleted = apply(state, { type: "card.delete", cardId }, "bruno");
    const change = {
      type: "card.update" as const,
      cardId,
      change: { field: "title" as const, value: "Novo" },
      baseSeq: 3,
    };
    const item = trayItemFor(reject(change, "deleted"))!;
    const ops = resolve(item, "restore", deleted);
    expect(ops).toEqual([
      { type: "card.restore", cardId, columnId: todo },
      { type: "card.update", cardId, change: { field: "title", value: "Novo" } },
    ]);
    const restored = ops.reduce((s, op) => apply(s, op), deleted);
    expect(restored.cards[cardId]?.title).toBe("Novo");
  });

  it("lets a card meant for a deleted column go to another one", () => {
    const { state, doing } = board();
    const create: Operation = { type: "card.create", cardId: uuidv7(), columnId: uuidv7(), title: "Perdido" };
    const item = trayItemFor(reject(create, "column_deleted"))!;
    expect(resolve(item, { columnId: doing }, state)).toEqual([
      { ...create, columnId: doing, afterId: null, beforeId: null },
    ]);
  });

  it("leaves other rejections to a passing notice", () => {
    expect(trayItemFor(reject({ type: "column.delete", columnId: "x" }, "column_not_empty"))).toBeNull();
  });
});
