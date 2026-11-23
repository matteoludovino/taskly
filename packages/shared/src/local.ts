import { decide, type RejectCode } from "./decide";
import type { BoardState } from "./model";
import type { Envelope } from "./ops";
import type { OpResult } from "./protocol";
import { applyEvent } from "./reduce";

/**
 * A client's copy of a board: what the server confirmed, plus the operations it sent (or will send) and
 * hasn't heard back about. The screen shows `view()`: pending operations replayed over the confirmed
 * board with the same rules the server uses, so a change appears at once and settles into place when
 * the server answers.
 */
export interface LocalBoard {
  confirmed: BoardState;
  pending: Envelope[];
}

export function localBoard(confirmed: BoardState): LocalBoard {
  return { confirmed, pending: [] };
}

export function view({ confirmed, pending }: LocalBoard, actorId: string | null = null): BoardState {
  return pending.reduce((state, { op }) => {
    const decision = decide(state, op, actorId);
    // Provisional: shown, but the board's seq stays at what the server confirmed.
    return decision.kind === "event"
      ? applyEvent(state, { ...decision.event, seq: state.seq, actorId })
      : state;
  }, confirmed);
}

export function enqueue(local: LocalBoard, envelope: Envelope): LocalBoard {
  return { ...local, pending: [...local.pending, envelope] };
}

export interface Settled {
  local: LocalBoard;
  /** The server moved on in ways this copy hasn't seen: fetch a fresh snapshot. */
  stale: boolean;
  /** Set when the server turned the operation down. */
  rejected?: RejectCode;
}

/** Folds the server's answer to one pending operation into the local copy. */
export function settle(local: LocalBoard, clientOpId: string, result: OpResult): Settled {
  const pending = local.pending.filter((e) => e.clientOpId !== clientOpId);
  const { confirmed } = local;
  if (result.result === "applied") {
    const { event } = result;
    if (event.seq === confirmed.seq + 1)
      return { local: { confirmed: applyEvent(confirmed, event), pending }, stale: false };
    // Already in the snapshot we hold (seq ≤ ours), or others wrote in between (seq > ours + 1).
    return { local: { confirmed, pending }, stale: event.seq > confirmed.seq };
  }
  const stale = result.seq > confirmed.seq;
  return result.result === "rejected"
    ? { local: { confirmed, pending }, stale, rejected: result.code }
    : { local: { confirmed, pending }, stale };
}

/** A fresh snapshot replaces the confirmed board unless it's older than what we have. */
export function refresh(local: LocalBoard, snapshot: BoardState): LocalBoard {
  return snapshot.seq >= local.confirmed.seq ? { ...local, confirmed: snapshot } : local;
}
