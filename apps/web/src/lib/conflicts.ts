import {
  cardsIn,
  sortedColumns,
  type BoardState,
  type CardChange,
  type CardField,
  type Operation,
  type Rejection,
} from "@taskly/shared";

/**
 * The conflict tray: rejected changes the person may want to act on, kept until they do. Each kind comes
 * with its way out; anything else the server turns down is just a passing notice.
 */
export type TrayItem =
  /** Someone else changed the same field first. */
  | {
      id: string;
      kind: "field";
      cardId: string;
      field: CardField;
      mine: CardChange["value"];
      theirs: CardChange["value"];
      by: string | null;
      version: number;
    }
  /** The card was deleted before this change (an edit or a move) arrived. */
  | {
      id: string;
      kind: "deleted";
      cardId: string;
      op: Extract<Operation, { type: "card.update" | "card.move" }>;
    }
  /** A new card was headed for a column that no longer exists. */
  | { id: string; kind: "column-gone"; op: Extract<Operation, { type: "card.create" }> }
  /** A move was headed for a column that no longer exists (the card stayed where it was). */
  | { id: string; kind: "move-gone"; cardId: string };

export function trayItemFor({ clientOpId, code, op, conflict }: Rejection): TrayItem | null {
  if (code === "conflict" && op.type === "card.update" && conflict) {
    return {
      id: `field:${op.cardId}:${conflict.field}`,
      kind: "field",
      cardId: op.cardId,
      field: conflict.field,
      mine: op.change.value,
      theirs: conflict.theirs,
      by: conflict.by,
      version: conflict.version,
    };
  }
  if (code === "deleted" && (op.type === "card.update" || op.type === "card.move")) {
    return { id: `deleted:${op.cardId}`, kind: "deleted", cardId: op.cardId, op };
  }
  if (code === "column_deleted" && op.type === "card.create")
    return { id: clientOpId, kind: "column-gone", op };
  if (code === "column_deleted" && op.type === "card.move") {
    return { id: `move:${op.cardId}`, kind: "move-gone", cardId: op.cardId };
  }
  return null;
}

/** Adds an item; a newer one about the same thing replaces the older. */
export function addToTray(tray: TrayItem[], item: TrayItem): TrayItem[] {
  return [...tray.filter((i) => i.id !== item.id), item];
}

export type Resolution = "mine" | "theirs" | "restore" | "dismiss" | { columnId: string };

/** The operations that carry out what the person chose (none: just let it go). */
export function resolve(item: TrayItem, resolution: Resolution, board: BoardState): Operation[] {
  if (resolution === "dismiss" || resolution === "theirs") return [];
  switch (item.kind) {
    case "field":
      // The same change, based on the version that's there now: it replaces theirs.
      if (resolution !== "mine") return [];
      return [
        {
          type: "card.update",
          cardId: item.cardId,
          change: fieldChange(item.field, item.mine),
          baseSeq: item.version,
        },
      ];
    case "deleted": {
      if (resolution !== "restore") return [];
      const card = board.deletedCards[item.cardId];
      if (!card) return [];
      const home = board.columns[card.columnId] ? card.columnId : sortedColumns(board)[0]?.id;
      if (!home) return [];
      const { op } = item;
      // Bring it back, then apply the change that bounced (the person is deciding now: no base).
      const again: Operation =
        op.type === "card.update" ? { type: "card.update", cardId: op.cardId, change: op.change } : op;
      return [{ type: "card.restore", cardId: item.cardId, columnId: home }, again];
    }
    case "column-gone": {
      if (typeof resolution !== "object") return [];
      const last = cardsIn(board, resolution.columnId).at(-1);
      return [{ ...item.op, columnId: resolution.columnId, afterId: last?.id ?? null, beforeId: null }];
    }
    case "move-gone":
      return [];
  }
}

function fieldChange(field: CardField, value: CardChange["value"]): CardChange {
  return { field, value } as CardChange;
}
