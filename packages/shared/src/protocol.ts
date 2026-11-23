import { z } from "zod";
import type { FieldConflict, RejectCode } from "./decide";
import type { BoardEvent } from "./events";
import {
  boardTitle,
  participantColor,
  participantName,
  type BoardState,
  type ParticipantState,
} from "./model";

/**
 * Version of the client-server protocol. The server accepts this version and the one before it, so a
 * deploy (server first, then web) never strands an open tab; anything older is told to reload.
 */
export const PROTOCOL_VERSION = 1;

export function isSupportedProtocol(version: number): boolean {
  return version === PROTOCOL_VERSION || version === PROTOCOL_VERSION - 1;
}

/** `GET /api/health`: answers without touching the database, so it doubles as a cheap wake-up call. */
export const healthResponse = z.object({
  status: z.literal("ok"),
  protocolVersion: z.number().int(),
});
export type HealthResponse = z.infer<typeof healthResponse>;

/** What `POST /api/boards/:id/ops` (and later the WebSocket) answers to an operation. */
export type OpResult =
  | { result: "applied"; event: BoardEvent }
  | { result: "noop"; seq: number }
  | { result: "rejected"; code: RejectCode; seq: number; conflict?: FieldConflict };

/** `GET /api/boards/:id`: the whole board, and who you are on it. */
export interface BoardSnapshot {
  board: BoardState;
  me: ParticipantState;
}

/** `POST /api/boards`: a new board, and its creator as the first participant. */
export const createBoardRequest = z.object({
  title: boardTitle,
  name: participantName,
  color: participantColor,
});
export type CreateBoardRequest = z.infer<typeof createBoardRequest>;
export interface CreateBoardResponse {
  boardId: string;
  /** The secret that lets people in. Only ever travels in the link's #fragment and in POST bodies. */
  key: string;
}

/** `POST /api/boards/:id/join`. */
export const joinBoardRequest = z.object({
  key: z.string().min(16).max(128),
  name: participantName,
  color: participantColor,
});
export type JoinBoardRequest = z.infer<typeof joinBoardRequest>;

export const BOARD_ID = /^[A-Za-z0-9]{10}$/;

/** `GET /api/boards/:id/events?before=<seq>&limit=<n>`: the history, newest first. */
export interface HistoryPage {
  events: BoardEvent[];
  /** Older events exist (ask again with `before` = the last seq here). */
  hasMore: boolean;
}
export const HISTORY_PAGE_MAX = 100;

/** Every API error looks like this; `message` is ready to show (pt-BR). */
export interface ApiError {
  error: { code: string; message: string };
}
