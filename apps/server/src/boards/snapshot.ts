import {
  CARD_FIELDS,
  emptyBoard,
  type BoardState,
  type CardField,
  type FieldVersion,
  type Priority,
} from "@taskly/shared";
import type { Db } from "../db.ts";

export const toIsoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
export const fromIsoDate = (value: string | null) => (value ? new Date(`${value}T00:00:00Z`) : null);

function versions(json: unknown): Partial<Record<CardField, FieldVersion>> {
  const source = (json ?? {}) as Record<string, FieldVersion>;
  return Object.fromEntries(CARD_FIELDS.filter((f) => source[f]).map((f) => [f, source[f]!]));
}

/**
 * Reads a whole board in one consistent snapshot (REPEATABLE READ): the rows and the seq they reflect
 * come from the same moment, even if another writer commits meanwhile.
 */
export async function loadBoard(db: Db, boardId: string): Promise<BoardState | null> {
  const [board, participants, columns, cards] = await db.$transaction(
    [
      db.board.findUnique({ where: { id: boardId } }),
      db.participant.findMany({ where: { boardId }, orderBy: { createdAt: "asc" } }),
      db.column.findMany({ where: { boardId } }),
      db.card.findMany({ where: { boardId } }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  if (!board) return null;

  const state = emptyBoard(board.id, board.title);
  state.seq = board.seq;
  for (const p of participants) state.participants[p.id] = { id: p.id, name: p.name, color: p.color };
  for (const c of columns) {
    if (c.deletedAt || c.position === null) state.deletedColumns[c.id] = c.title;
    else state.columns[c.id] = { id: c.id, title: c.title, position: c.position };
  }
  for (const c of cards) {
    const card = {
      id: c.id,
      columnId: c.columnId,
      title: c.title,
      priority: c.priority as Priority,
      dueDate: toIsoDate(c.dueDate),
      completed: c.completed,
      position: c.position ?? "",
      versions: versions(c.fieldVersions),
    };
    if (c.deletedAt || c.position === null) state.deletedCards[c.id] = card;
    else state.cards[c.id] = card;
  }
  return state;
}
