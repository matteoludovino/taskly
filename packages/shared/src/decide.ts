import type { EventBody } from "./events";
import { cardsIn, sortedColumns, type BoardState, type CardState } from "./model";
import type { Operation } from "./ops";
import { keyBetween, resolvePlacement, type Placed } from "./positions";

export type RejectCode =
  /** The id points at nothing this board ever had. */
  | "not_found"
  /** The card or column was deleted (by someone else, usually). */
  | "deleted"
  /** The target column was deleted. */
  | "column_deleted"
  /** Only empty columns can be deleted. */
  | "column_not_empty"
  /** The id is taken. */
  | "exists";

export type Decision =
  { kind: "event"; event: EventBody } | { kind: "noop" } | { kind: "rejected"; code: RejectCode };

const event = (body: EventBody): Decision => ({ kind: "event", event: body });
const noop: Decision = { kind: "noop" };
const reject = (code: RejectCode): Decision => ({ kind: "rejected", code });

/** The key for an item landing between two neighbours, or null when it already sits exactly there. */
function placeAmong<T extends Placed>(
  siblings: readonly T[],
  afterId: string | null | undefined,
  beforeId: string | null | undefined,
  current?: { prev: T | null; next: T | null },
): string | null {
  const { prev, next } = resolvePlacement(siblings, afterId, beforeId);
  if (current && current.prev?.id === prev?.id && current.next?.id === next?.id) return null;
  return keyBetween(prev?.position ?? null, next?.position ?? null);
}

function neighboursOf<T extends Placed>(list: readonly T[], itemId: string) {
  const index = list.findIndex((item) => item.id === itemId);
  return { prev: list[index - 1] ?? null, next: list[index + 1] ?? null };
}

/**
 * Turns an operation into what should happen to the board, without touching it. The server runs it to
 * decide for real; a client runs the same function to show its own change before the server confirms.
 * Precedence: a delete beats a move, which beats a field edit.
 */
export function decide(state: BoardState, op: Operation): Decision {
  switch (op.type) {
    case "board.rename":
      if (op.title === state.title) return noop;
      return event({ type: "board.renamed", payload: { title: op.title, previousTitle: state.title } });

    case "column.create": {
      if (state.columns[op.columnId] || state.deletedColumns[op.columnId] !== undefined)
        return reject("exists");
      const position = placeAmong(sortedColumns(state), op.afterId, undefined)!;
      return event({
        type: "column.created",
        payload: { columnId: op.columnId, title: op.title, position },
      });
    }

    case "column.rename": {
      const column = state.columns[op.columnId];
      if (!column) return reject(state.deletedColumns[op.columnId] !== undefined ? "deleted" : "not_found");
      if (column.title === op.title) return noop;
      return event({
        type: "column.renamed",
        payload: { columnId: column.id, title: op.title, previousTitle: column.title },
      });
    }

    case "column.move": {
      const column = state.columns[op.columnId];
      if (!column) return reject(state.deletedColumns[op.columnId] !== undefined ? "deleted" : "not_found");
      const all = sortedColumns(state);
      const others = all.filter((c) => c.id !== column.id);
      const position = placeAmong(others, op.afterId, op.beforeId, neighboursOf(all, column.id));
      if (position === null) return noop;
      return event({ type: "column.moved", payload: { columnId: column.id, title: column.title, position } });
    }

    case "column.delete": {
      const column = state.columns[op.columnId];
      if (!column) return state.deletedColumns[op.columnId] !== undefined ? noop : reject("not_found");
      if (cardsIn(state, column.id).length > 0) return reject("column_not_empty");
      return event({ type: "column.deleted", payload: { columnId: column.id, title: column.title } });
    }

    case "card.create": {
      if (state.cards[op.cardId] || state.deletedCards[op.cardId] !== undefined) return reject("exists");
      const column = state.columns[op.columnId];
      if (!column)
        return reject(state.deletedColumns[op.columnId] !== undefined ? "column_deleted" : "not_found");
      const position = placeAmong(cardsIn(state, column.id), op.afterId, op.beforeId)!;
      return event({
        type: "card.created",
        payload: {
          cardId: op.cardId,
          columnId: column.id,
          title: op.title,
          position,
          priority: "med",
          columnTitle: column.title,
        },
      });
    }

    case "card.update": {
      const card = findCard(state, op.cardId);
      if (typeof card === "string") return reject(card);
      const previous = card[op.change.field];
      if (previous === op.change.value) return noop;
      return event({
        type: "card.updated",
        payload: { cardId: card.id, cardTitle: card.title, change: op.change, previous },
      });
    }

    case "card.move": {
      const card = findCard(state, op.cardId);
      if (typeof card === "string") return reject(card);
      const to = state.columns[op.toColumnId];
      if (!to)
        return reject(state.deletedColumns[op.toColumnId] !== undefined ? "column_deleted" : "not_found");
      const target = cardsIn(state, to.id);
      const others = target.filter((c) => c.id !== card.id);
      const current = card.columnId === to.id ? neighboursOf(target, card.id) : undefined;
      const position = placeAmong(others, op.afterId, op.beforeId, current);
      if (position === null) return noop;
      return event({
        type: "card.moved",
        payload: {
          cardId: card.id,
          cardTitle: card.title,
          fromColumnId: card.columnId,
          toColumnId: to.id,
          position,
          fromColumnTitle: state.columns[card.columnId]?.title ?? "",
          toColumnTitle: to.title,
        },
      });
    }

    case "card.delete": {
      const card = state.cards[op.cardId];
      if (!card) return state.deletedCards[op.cardId] !== undefined ? noop : reject("not_found");
      return event({
        type: "card.deleted",
        payload: { cardId: card.id, cardTitle: card.title, columnId: card.columnId },
      });
    }
  }
}

function findCard(state: BoardState, cardId: string): CardState | "deleted" | "not_found" {
  return state.cards[cardId] ?? (state.deletedCards[cardId] !== undefined ? "deleted" : "not_found");
}
