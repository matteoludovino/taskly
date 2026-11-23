import { describe, expect, it } from "vitest";
import { cardsIn, decide, uuidv7, type BoardState, type CardChange } from "../src";
import { apply, run, threeColumns } from "./helpers";

/** A board with one card ("Original", created by Ana), and the seq the card was created at. */
function oneCard() {
  const { state: base, todo, doing } = threeColumns();
  const cardId = uuidv7();
  const state = apply(base, { type: "card.create", cardId, columnId: todo, title: "Original" });
  return { state, cardId, todo, doing, createdAt: state.seq };
}

const edit = (state: BoardState, cardId: string, change: CardChange, actor: string, baseSeq?: number) =>
  run(state, { type: "card.update", cardId, change, ...(baseSeq === undefined ? {} : { baseSeq }) }, actor);

describe("field conflicts", () => {
  it("happen when someone else changed the field after the version the edit was based on", () => {
    const { state, cardId, createdAt } = oneCard();
    const bruno = edit(state, cardId, { field: "title", value: "Do Bruno" }, "bruno").state;
    const { decision } = edit(bruno, cardId, { field: "title", value: "Da Ana" }, "ana", createdAt);
    expect(decision).toEqual({
      kind: "rejected",
      code: "conflict",
      conflict: { field: "title", theirs: "Do Bruno", by: "bruno", version: bruno.seq },
    });
  });

  it("don't happen between a person's own successive edits", () => {
    const { state, cardId, createdAt } = oneCard();
    const first = edit(state, cardId, { field: "title", value: "Um" }, "ana", createdAt).state;
    expect(edit(first, cardId, { field: "title", value: "Dois" }, "ana", createdAt).decision.kind).toBe(
      "event",
    );
  });

  it("don't happen on different fields of the same card", () => {
    const { state, cardId, createdAt } = oneCard();
    const bruno = edit(state, cardId, { field: "priority", value: "high" }, "bruno").state;
    expect(edit(bruno, cardId, { field: "title", value: "Ana" }, "ana", createdAt).decision.kind).toBe(
      "event",
    );
  });

  it("aren't raised when both chose the same value", () => {
    const { state, cardId, createdAt } = oneCard();
    const bruno = edit(state, cardId, { field: "completed", value: true }, "bruno").state;
    expect(edit(bruno, cardId, { field: "completed", value: true }, "ana", createdAt).decision.kind).toBe(
      "noop",
    );
  });

  it("go away when the edit is based on the current version (keep mine)", () => {
    const { state, cardId } = oneCard();
    const bruno = edit(state, cardId, { field: "title", value: "Do Bruno" }, "bruno").state;
    const mine = edit(bruno, cardId, { field: "title", value: "Da Ana" }, "ana", bruno.seq);
    expect(mine.decision.kind).toBe("event");
    expect(mine.state.cards[cardId]?.versions.title).toEqual({ seq: mine.state.seq, by: "ana" });
  });

  it("aren't checked for edits without a base (last writer wins)", () => {
    const { state, cardId } = oneCard();
    const bruno = edit(state, cardId, { field: "title", value: "Do Bruno" }, "bruno").state;
    expect(edit(bruno, cardId, { field: "title", value: "Da Ana" }, "ana").decision.kind).toBe("event");
  });

  it("lose to a delete", () => {
    const { state, cardId, createdAt } = oneCard();
    const deleted = apply(state, { type: "card.delete", cardId });
    expect(edit(deleted, cardId, { field: "title", value: "x" }, "ana", createdAt).decision).toEqual({
      kind: "rejected",
      code: "deleted",
    });
  });
});

describe("restoring a card", () => {
  it("brings it back with its fields, at the end of the chosen column", () => {
    const { state, cardId, doing } = oneCard();
    const edited = edit(state, cardId, { field: "priority", value: "high" }, "bruno").state;
    const other = uuidv7();
    const withOther = apply(edited, { type: "card.create", cardId: other, columnId: doing, title: "Outro" });
    const deleted = apply(withOther, { type: "card.delete", cardId });
    expect(deleted.deletedCards[cardId]).toMatchObject({ title: "Original", priority: "high" });
    const restored = apply(deleted, { type: "card.restore", cardId, columnId: doing });
    expect(cardsIn(restored, doing).map((c) => c.title)).toEqual(["Outro", "Original"]);
    expect(restored.cards[cardId]).toMatchObject({
      priority: "high",
      versions: edited.cards[cardId]!.versions,
    });
    expect(restored.deletedCards[cardId]).toBeUndefined();
  });

  it("is a no-op for a card that exists, and refuses unknown cards and deleted columns", () => {
    const { state, cardId, todo, doing } = oneCard();
    expect(decide(state, { type: "card.restore", cardId, columnId: todo }).kind).toBe("noop");
    expect(decide(state, { type: "card.restore", cardId: uuidv7(), columnId: todo })).toEqual({
      kind: "rejected",
      code: "not_found",
    });
    const gone = apply(state, { type: "card.delete", cardId }, { type: "column.delete", columnId: doing });
    expect(decide(gone, { type: "card.restore", cardId, columnId: doing })).toEqual({
      kind: "rejected",
      code: "column_deleted",
    });
  });
});
