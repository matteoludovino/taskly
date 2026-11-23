import {
  applyEvent,
  decide,
  emptyBoard,
  uuidv7,
  type BoardState,
  type Decision,
  type Operation,
} from "../src";

/** Applies an operation the way the server does: decide, then record the event with the next seq. */
export function run(
  state: BoardState,
  op: Operation,
  actorId = "ana",
): { state: BoardState; decision: Decision } {
  const decision = decide(state, op, actorId);
  if (decision.kind !== "event") return { state, decision };
  return { state: applyEvent(state, { ...decision.event, seq: state.seq + 1, actorId }), decision };
}

export function apply(state: BoardState, ...ops: Operation[]): BoardState {
  return ops.reduce((current, op) => {
    const { state: next, decision } = run(current, op);
    if (decision.kind === "rejected") throw new Error(`${op.type} rejected: ${decision.code}`);
    return next;
  }, state);
}

/** A board with three columns, "todo", "doing" and "done" (ids returned). */
export function threeColumns() {
  const ids = { todo: uuidv7(), doing: uuidv7(), done: uuidv7() };
  const state = apply(
    emptyBoard("board", "Quadro"),
    { type: "column.create", columnId: ids.todo, title: "A fazer" },
    { type: "column.create", columnId: ids.doing, title: "Fazendo" },
    { type: "column.create", columnId: ids.done, title: "Feito" },
  );
  return { state, ...ids };
}
