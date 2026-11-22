import { z } from "zod";
import type { RejectCode } from "./decide";
import type { BoardEvent } from "./events";
import type { BoardState, ParticipantState } from "./model";

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
  | { result: "rejected"; code: RejectCode; seq: number };

/** `GET /api/boards/:id`: the whole board, and who you are on it. */
export interface BoardSnapshot {
  board: BoardState;
  me: ParticipantState;
}
