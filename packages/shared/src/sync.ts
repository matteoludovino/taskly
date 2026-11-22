import type { RejectCode } from "./decide";
import type { BoardEvent } from "./events";
import type { BoardState } from "./model";
import type { Envelope } from "./ops";
import { PROTOCOL_VERSION } from "./protocol";
import { applyEvent } from "./reduce";
import type { ClientMessage, ServerMessage } from "./wire";

/**
 * A client's side of the sync protocol, as pure functions: given the state and what happened, return
 * the new state and what to send. The transport (browser WebSocket, the test bot) only moves messages.
 *
 * Rules that keep every client converging on the server's board, whatever the network does:
 * - events are applied strictly in seq order: older ones are ignored, ones past a gap wait in `ahead`
 *   until the gap closes (or a `pull` fills it);
 * - a pending operation is dropped only once the board has caught up with the server's answer to it:
 *   its event is applied, or, for an operation that changed nothing (or was turned down), the board
 *   reached the seq the server decided at. Never just because an ack arrived first;
 * - after (re)connecting, pending operations are resent in their original order. Resending is safe: the
 *   server answers an operation it already applied with the original event.
 */
export interface SyncState {
  confirmed: BoardState;
  pending: Envelope[];
  ahead: Record<number, BoardEvent>;
  /** Operations the server answered without an event (no-op or rejected), and the seq it decided at. */
  settled: Record<string, number>;
  /** The server finished catching this connection up; operations can go out. */
  synced: boolean;
}

export interface SyncOutput {
  state: SyncState;
  send: ClientMessage[];
  rejected: { clientOpId: string; code: RejectCode }[];
}

export function initialSync(confirmed: BoardState): SyncState {
  return { confirmed, pending: [], ahead: {}, settled: {}, synced: false };
}

const opMessage = ({ clientOpId, op }: Envelope): ClientMessage => ({ t: "op", clientOpId, op });

/** A new connection is open: say where we are. Anything past a gap will come again in the catch-up. */
export function connect(state: SyncState): SyncOutput {
  return {
    state: { ...state, ahead: {}, synced: false },
    send: [{ t: "hello", protocolVersion: PROTOCOL_VERSION, lastSeq: state.confirmed.seq }],
    rejected: [],
  };
}

/** The connection dropped: hold operations until the next one is caught up. */
export function disconnect(state: SyncState): SyncState {
  return { ...state, synced: false };
}

export function submit(state: SyncState, envelope: Envelope): SyncOutput {
  return {
    state: { ...state, pending: [...state.pending, envelope] },
    send: state.synced ? [opMessage(envelope)] : [],
    rejected: [],
  };
}

/** Events are waiting behind a missing one. */
export function hasGap(state: SyncState): boolean {
  return Object.keys(state.ahead).length > 0;
}

export function pull(state: SyncState): ClientMessage {
  return { t: "pull", fromSeq: state.confirmed.seq };
}

/** Applies every event that can be applied now, in order, and drops the operations they confirm. */
function advance(state: SyncState): SyncState {
  let { confirmed, pending } = state;
  const ahead = { ...state.ahead };
  for (let next = ahead[confirmed.seq + 1]; next; next = ahead[confirmed.seq + 1]) {
    delete ahead[next.seq];
    confirmed = applyEvent(confirmed, next);
    const done = next.clientOpId;
    if (done) pending = pending.filter((e) => e.clientOpId !== done);
  }
  for (const seq of Object.keys(ahead)) if (Number(seq) <= confirmed.seq) delete ahead[Number(seq)];
  const settled = { ...state.settled };
  for (const [clientOpId, seq] of Object.entries(settled)) {
    if (seq > confirmed.seq) continue;
    delete settled[clientOpId];
    pending = pending.filter((e) => e.clientOpId !== clientOpId);
  }
  return { ...state, confirmed, pending, ahead, settled };
}

function accept(state: SyncState, event: BoardEvent): SyncState {
  if (event.seq <= state.confirmed.seq) {
    // Already part of the board we have (seen live, or inside a snapshot): its operation is done.
    const done = event.clientOpId;
    return done ? { ...state, pending: state.pending.filter((e) => e.clientOpId !== done) } : state;
  }
  return advance({ ...state, ahead: { ...state.ahead, [event.seq]: event } });
}

export function receive(state: SyncState, message: ServerMessage): SyncOutput {
  const out = (next: SyncState, send: ClientMessage[] = [], rejected: SyncOutput["rejected"] = []) => ({
    state: next,
    send,
    rejected,
  });
  switch (message.t) {
    case "event":
      return out(accept(state, message.event));

    case "snapshot":
      // A snapshot only replaces an older board. Pending operations stay: they'll be resent after
      // `synced`, and the server answers the ones it already applied with their original events.
      if (message.board.seq < state.confirmed.seq) return out(state);
      return out(advance({ ...state, confirmed: message.board }));

    case "ack": {
      const { result, clientOpId } = message;
      if (result.result === "applied") return out(accept(state, result.event));
      if (!state.pending.some((e) => e.clientOpId === clientOpId)) return out(state);
      const next = advance({ ...state, settled: { ...state.settled, [clientOpId]: result.seq } });
      return result.result === "rejected" ? out(next, [], [{ clientOpId, code: result.code }]) : out(next);
    }

    case "synced":
      // Answered operations aren't resent: they wait for the board to catch up.
      return out(
        { ...state, synced: true },
        state.pending.filter((e) => state.settled[e.clientOpId] === undefined).map(opMessage),
      );

    case "presence":
    case "pong":
      return out(state);
  }
}
