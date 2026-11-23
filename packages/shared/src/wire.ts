import { z } from "zod";
import type { BoardEvent } from "./events";
import type { BoardState } from "./model";
import { operation } from "./ops";
import type { OpResult } from "./protocol";

/**
 * WebSocket messages (JSON text frames). A connection starts with `hello`; the server answers with
 * whatever the client missed (the events after `lastSeq`, or a whole snapshot when that's shorter), then
 * `synced`. From then on every change on the board arrives as an `event`, in seq order, the sender's
 * own included; the sender also gets an `ack` for each of its operations.
 */
export const clientMessage = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello"),
    protocolVersion: z.number().int(),
    lastSeq: z.number().int().nonnegative(),
  }),
  z.object({ t: z.literal("op"), clientOpId: z.uuid(), op: operation }),
  z.object({ t: z.literal("pull"), fromSeq: z.number().int().nonnegative() }),
  z.object({ t: z.literal("ping") }),
  /** What this connection is doing right now (shown to the others), or null when nothing. */
  z.object({
    t: z.literal("focus"),
    focus: z.object({ cardId: z.uuid(), mode: z.enum(["editing", "dragging"]) }).nullable(),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessage>;
export type Focus = NonNullable<Extract<ClientMessage, { t: "focus" }>["focus"]>;

/** Someone editing or dragging a card. Ephemeral: it lives with the connection. */
export interface Activity extends Focus {
  participantId: string;
}

export type ServerMessage =
  | { t: "snapshot"; board: BoardState }
  | { t: "event"; event: BoardEvent }
  | { t: "ack"; clientOpId: string; result: OpResult }
  | { t: "synced"; seq: number }
  /** Participant ids with at least one open connection, and what each connection is doing. */
  | { t: "presence"; online: string[]; activity: Activity[] }
  | { t: "pong" };

/** WebSocket close codes the client acts on. */
export const CLOSE = {
  /** The server is restarting (deploy): reconnect right away. */
  restarting: 1012,
  /** The client speaks a protocol the server no longer accepts: reload the page. */
  outdated: 4002,
  /** The participant's access is gone (board deleted or expired). */
  gone: 4004,
  /** The client sent something it shouldn't (malformed, too large, too fast). */
  violation: 1008,
  /** The client couldn't keep up with the board's updates: reconnect and catch up. */
  tooSlow: 4008,
} as const;

/** `POST /api/boards/:id/ticket`: a one-time pass to open the board's WebSocket. */
export interface TicketResponse {
  url: string;
}
