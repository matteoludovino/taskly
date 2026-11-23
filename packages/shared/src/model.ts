import { z } from "zod";

export const PRIORITIES = ["low", "med", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Participant colours: distinct from each other and readable as text on white and on dark surfaces. */
export const PARTICIPANT_COLORS = [
  "#2563eb",
  "#db2777",
  "#16a34a",
  "#ea580c",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
] as const;

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const boardTitle = trimmed(80);
export const columnTitle = trimmed(60);
export const cardTitle = trimmed(200);
export const participantName = trimmed(40);
export const participantColor = z.enum(PARTICIPANT_COLORS);
export const priority = z.enum(PRIORITIES);
export const isoDate = z.iso.date();
export const id = z.uuid();

export const CARD_FIELDS = ["title", "priority", "dueDate", "completed"] as const;
export type CardField = (typeof CARD_FIELDS)[number];

/** Who last changed a card field, and at which point of the board's history. */
export interface FieldVersion {
  seq: number;
  by: string | null;
}

export interface ColumnState {
  id: string;
  title: string;
  position: string;
}

export interface CardState {
  id: string;
  columnId: string;
  title: string;
  priority: Priority;
  dueDate: string | null;
  completed: boolean;
  position: string;
  versions: Partial<Record<CardField, FieldVersion>>;
}

export interface ParticipantState {
  id: string;
  name: string;
  color: string;
}

export interface BoardState {
  id: string;
  title: string;
  /** The last event applied. Events are numbered 1, 2, 3… per board, with no gaps. */
  seq: number;
  columns: Record<string, ColumnState>;
  cards: Record<string, CardState>;
  participants: Record<string, ParticipantState>;
  /** Titles of deleted columns, so a late change can say what it was about. */
  deletedColumns: Record<string, string>;
  /** Deleted cards as they were, so they can be restored. */
  deletedCards: Record<string, CardState>;
}

export function sortedColumns(state: BoardState): ColumnState[] {
  return Object.values(state.columns).sort((a, b) => (a.position < b.position ? -1 : 1));
}

export function cardsIn(state: BoardState, columnId: string): CardState[] {
  return Object.values(state.cards)
    .filter((card) => card.columnId === columnId)
    .sort((a, b) => (a.position < b.position ? -1 : 1));
}
