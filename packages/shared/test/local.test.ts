import { describe, expect, it } from "vitest";
import {
  applyEvent,
  cardsIn,
  decide,
  enqueue,
  localBoard,
  refresh,
  settle,
  uuidv7,
  view,
  type BoardEvent,
  type BoardState,
  type Envelope,
  type Operation,
} from "../src";
import { threeColumns } from "./helpers";

/** What the server would answer to `op` on `server`, and its board afterwards. */
function serve(server: BoardState, envelope: Envelope, actorId = "ana") {
  const decision = decide(server, envelope.op);
  if (decision.kind !== "event") throw new Error("expected an event");
  const event = {
    ...decision.event,
    seq: server.seq + 1,
    clientOpId: envelope.clientOpId,
    actorId,
    at: "now",
  } as BoardEvent;
  return { event, server: applyEvent(server, event) };
}

const env = (op: Operation): Envelope => ({ clientOpId: uuidv7(), op });

describe("local board", () => {
  it("shows pending changes right away, before the server answers", () => {
    const { state, todo } = threeColumns();
    const local = enqueue(
      localBoard(state),
      env({ type: "card.create", cardId: uuidv7(), columnId: todo, title: "Já aparece" }),
    );
    expect(cardsIn(view(local), todo).map((c) => c.title)).toEqual(["Já aparece"]);
    expect(view(local).seq).toBe(state.seq);
  });

  it("settles into the server's version when it answers", () => {
    const { state, todo } = threeColumns();
    const envelope = env({ type: "card.create", cardId: uuidv7(), columnId: todo, title: "Novo" });
    const { event, server } = serve(state, envelope);
    const settled = settle(enqueue(localBoard(state), envelope), envelope.clientOpId, {
      result: "applied",
      event,
    });
    expect(settled.stale).toBe(false);
    expect(settled.local.pending).toEqual([]);
    expect(settled.local.confirmed).toEqual(server);
  });

  it("asks for a fresh snapshot when others wrote in between", () => {
    const { state, todo } = threeColumns();
    const theirs = serve(state, env({ type: "board.rename", title: "Renomeado por Bruno" }), "bruno");
    const mine = env({ type: "card.create", cardId: uuidv7(), columnId: todo, title: "Meu" });
    const { event, server } = serve(theirs.server, mine);
    const settled = settle(enqueue(localBoard(state), mine), mine.clientOpId, { result: "applied", event });
    expect(settled.stale).toBe(true);
    expect(refresh(settled.local, server).confirmed).toEqual(server);
  });

  it("drops a rejected operation and says why", () => {
    const { state } = threeColumns();
    const envelope = env({ type: "card.delete", cardId: uuidv7() });
    const settled = settle(enqueue(localBoard(state), envelope), envelope.clientOpId, {
      result: "rejected",
      code: "not_found",
      seq: state.seq,
    });
    expect(settled).toMatchObject({ rejected: "not_found", stale: false, local: { pending: [] } });
  });

  it("replays still-pending operations over a newer snapshot", () => {
    const { state, todo, doing } = threeColumns();
    const cardId = uuidv7();
    const created = serve(state, env({ type: "card.create", cardId, columnId: todo, title: "Cartão" }));
    // Someone else deletes the column we're about to move the card to; we hold a pending move.
    const local = enqueue(
      localBoard(created.server),
      env({ type: "card.move", cardId, toColumnId: doing, afterId: null, beforeId: null }),
    );
    expect(view(local).cards[cardId]?.columnId).toBe(doing);
    const after = refresh(
      local,
      serve(created.server, env({ type: "column.delete", columnId: doing }), "bruno").server,
    );
    // The move no longer makes sense: it shows as nothing, it doesn't throw.
    expect(view(after).cards[cardId]?.columnId).toBe(todo);
  });

  it("ignores a snapshot older than what it has", () => {
    const { state } = threeColumns();
    const newer = serve(state, env({ type: "board.rename", title: "Novo" })).server;
    expect(refresh(localBoard(newer), state).confirmed).toBe(newer);
  });
});
