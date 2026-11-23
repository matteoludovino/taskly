import {
  CLOSE,
  connect,
  disconnect,
  hasGap,
  initialSync,
  pull,
  receive,
  submit,
  uuidv7,
  type Activity,
  type BoardState,
  type ClientMessage,
  type Focus,
  type Operation,
  type Rejection,
  type ServerMessage,
  type SyncOutput,
  type SyncState,
  type TicketResponse,
} from "@taskly/shared";
import { api, ApiFailure } from "./api";

export type Connection =
  /** Opening the first connection. */
  | "connecting"
  /** Caught up and receiving changes as they happen. */
  | "live"
  /** Lost the connection; trying again (changes are kept and sent when it's back). */
  | "reconnecting"
  /** The server moved to a newer protocol: the page must be reloaded. */
  | "outdated"
  /** The board or this participant's access is gone. */
  | "gone"
  /** The participant cookie no longer works: join again. */
  | "unauthorized";

export interface LiveState {
  sync: SyncState;
  connection: Connection;
  online: string[];
  /** What the people on the board are editing or dragging right now. */
  activity: Activity[];
}

export interface LiveCallbacks {
  onRejected?: (rejection: Rejection) => void;
  /** The participant cookie stopped working (it expired, or the browser dropped it). */
  onUnauthorized?: () => void;
}

const GAP_WAIT_MS = 1500;
const PING_EVERY_MS = 25_000;
const PING_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Moves messages between a board's WebSocket and the sync engine, and keeps the connection alive:
 * reconnects with jittered backoff (a fresh ticket each time), retries at once when the network or the
 * tab comes back, pings to notice dead connections, and pulls when an event goes missing.
 */
export class LiveBoard {
  private state: LiveState;
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private gapTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private pongDeadline: ReturnType<typeof setTimeout> | undefined;
  private focus: Focus | null = null;
  private binaryListeners = new Set<(data: Uint8Array) => void>();
  private liveListeners = new Set<() => void>();

  constructor(
    private readonly boardId: string,
    initial: BoardState,
    private readonly callbacks: LiveCallbacks = {},
  ) {
    this.state = { sync: initialSync(initial), connection: "connecting", online: [], activity: [] };
  }

  // useSyncExternalStore plumbing.
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;

  start(): void {
    window.addEventListener("online", this.wakeUp);
    window.addEventListener("offline", this.wentOffline);
    document.addEventListener("visibilitychange", this.wakeUp);
    void this.open();
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener("online", this.wakeUp);
    window.removeEventListener("offline", this.wentOffline);
    document.removeEventListener("visibilitychange", this.wakeUp);
    clearTimeout(this.retryTimer);
    this.clearConnectionTimers();
    this.ws?.close(1000, "bye");
    this.ws = null;
  }

  submit(op: Operation): void {
    this.run(submit(this.state.sync, { clientOpId: uuidv7(), op }));
  }

  /** Tells the others what this person is editing or dragging (null: nothing). Resent after reconnects. */
  setFocus(focus: Focus | null): void {
    if (JSON.stringify(focus) === JSON.stringify(this.focus)) return;
    this.focus = focus;
    if (this.state.connection === "live") this.send({ t: "focus", focus });
  }

  /** Collaborative documents ride the same socket as binary frames. */
  sendBinary(data: Uint8Array): boolean {
    if (this.state.connection !== "live" || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(data);
    return true;
  }

  onBinary(listener: (data: Uint8Array) => void): () => void {
    this.binaryListeners.add(listener);
    return () => this.binaryListeners.delete(listener);
  }

  /** Called each time a connection is caught up (documents subscribe again then). */
  onLive(listener: () => void): () => void {
    this.liveListeners.add(listener);
    return () => this.liveListeners.delete(listener);
  }

  /** Try right now instead of waiting for the next scheduled attempt. */
  reconnectNow = (): void => {
    if (this.stopped || this.ws || !["reconnecting", "connecting"].includes(this.state.connection)) return;
    clearTimeout(this.retryTimer);
    void this.open();
  };

  private wakeUp = () => {
    if (document.visibilityState === "visible") this.reconnectNow();
  };

  private wentOffline = () => this.abandon("offline");

  /**
   * Gives up on the current socket now. A socket whose network is gone can't finish a close handshake,
   * so waiting for its close event could take minutes: detach it and carry on as if it had closed.
   */
  private abandon(reason: string) {
    const ws = this.ws;
    if (!ws) return;
    ws.onmessage = null;
    ws.onclose = null;
    ws.close(4000, reason);
    this.onClose(ws, 4000);
  }

  private set(patch: Partial<LiveState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private run(output: SyncOutput) {
    this.set({ sync: output.state });
    for (const message of output.send) this.send(message);
    for (const rejection of output.rejected) this.callbacks.onRejected?.(rejection);
  }

  private send(message: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private async open() {
    let url: string;
    try {
      ({ url } = await api<TicketResponse>(`/boards/${this.boardId}/ticket`, { method: "POST" }));
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.status === 401)
        return this.set({ connection: "unauthorized" });
      if (failure instanceof ApiFailure && failure.status === 404) return this.set({ connection: "gone" });
      return this.retryLater();
    }
    if (this.stopped) return;

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.run(connect(this.state.sync));
      this.pingTimer = setInterval(() => this.ping(), PING_EVERY_MS);
    };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        clearTimeout(this.pongDeadline);
        const bytes = new Uint8Array(event.data);
        this.binaryListeners.forEach((listener) => listener(bytes));
        return;
      }
      this.onMessage(JSON.parse(String(event.data)) as ServerMessage);
    };
    ws.onclose = (event) => this.onClose(ws, event.code);
  }

  private onMessage(message: ServerMessage) {
    clearTimeout(this.pongDeadline);
    this.run(receive(this.state.sync, message));
    if (message.t === "synced") {
      this.attempt = 0;
      this.set({ connection: "live" });
      if (this.focus) this.send({ t: "focus", focus: this.focus });
      this.liveListeners.forEach((listener) => listener());
    }
    if (message.t === "presence") this.set({ online: message.online, activity: message.activity ?? [] });
    if (hasGap(this.state.sync)) {
      this.gapTimer ??= setTimeout(() => {
        this.gapTimer = undefined;
        if (hasGap(this.state.sync)) this.send(pull(this.state.sync));
      }, GAP_WAIT_MS);
    } else {
      clearTimeout(this.gapTimer);
      this.gapTimer = undefined;
    }
  }

  private ping() {
    this.send({ t: "ping" });
    clearTimeout(this.pongDeadline);
    // Anything from the server counts as an answer; silence means the connection is dead.
    this.pongDeadline = setTimeout(() => this.abandon("no answer"), PING_TIMEOUT_MS);
  }

  private onClose(ws: WebSocket, code: number) {
    if (this.ws !== ws) return;
    this.ws = null;
    this.clearConnectionTimers();
    this.set({ sync: disconnect(this.state.sync), online: [], activity: [] });
    if (this.stopped) return;
    if (code === CLOSE.outdated) return this.set({ connection: "outdated" });
    if (code === CLOSE.gone) return this.set({ connection: "gone" });
    if (code === CLOSE.restarting) this.attempt = 0; // a deploy: come right back
    this.retryLater();
  }

  private retryLater() {
    if (this.stopped) return;
    this.set({
      connection:
        this.state.connection === "connecting" && this.attempt === 0 ? "connecting" : "reconnecting",
    });
    const ceiling = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    this.attempt += 1;
    // Full jitter: a server restart doesn't bring every client back in the same instant.
    this.retryTimer = setTimeout(() => void this.open(), Math.random() * ceiling);
  }

  private clearConnectionTimers() {
    clearInterval(this.pingTimer);
    clearTimeout(this.pongDeadline);
    clearTimeout(this.gapTimer);
    this.gapTimer = undefined;
  }
}
