import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@taskly/shared";
import WebSocket from "ws";

/** A WebSocket client for tests: records everything the server sends and waits for what's expected. */
export class TestClient {
  readonly received: ServerMessage[] = [];
  /** Binary frames (collaborative documents), handed to whoever listens. */
  readonly binaryListeners = new Set<(data: Uint8Array) => void>();
  readonly closed: Promise<{ code: number; reason: string }>;
  private waiters: (() => void)[] = [];

  private constructor(readonly ws: WebSocket) {
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        const bytes = new Uint8Array(data as Buffer);
        this.binaryListeners.forEach((listen) => listen(bytes));
        return;
      }
      this.received.push(JSON.parse(data.toString()) as ServerMessage);
      this.waiters.forEach((wake) => wake());
    });
    this.closed = new Promise((resolve) =>
      ws.on("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
        this.waiters.forEach((wake) => wake());
      }),
    );
  }

  static open(url: string, origin: string, options: WebSocket.ClientOptions = {}): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { origin, ...options });
      const client = new TestClient(ws);
      ws.once("open", () => resolve(client));
      ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      ws.once("error", reject);
    });
  }

  send(message: ClientMessage | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(message));
  }

  hello(lastSeq: number, protocolVersion = PROTOCOL_VERSION): void {
    this.send({ t: "hello", protocolVersion, lastSeq });
  }

  /** Resolves with the first message (from `from` on) that matches; fails after `ms`. */
  async until<T extends ServerMessage>(match: (m: ServerMessage) => m is T, from = 0, ms = 5000): Promise<T> {
    const deadline = Date.now() + ms;
    for (;;) {
      const found = this.received.slice(from).find(match);
      if (found) return found;
      if (Date.now() > deadline || this.ws.readyState === WebSocket.CLOSED) {
        throw new Error(`timed out; got ${JSON.stringify(this.received.map((m) => m.t))}`);
      }
      await new Promise<void>((wake) => {
        this.waiters.push(wake);
        setTimeout(wake, 50);
      });
      this.waiters = [];
    }
  }

  /** Seqs of every event received so far, in arrival order. */
  eventSeqs(): number[] {
    return this.received.flatMap((m) => (m.t === "event" ? [m.event.seq] : []));
  }

  close(): void {
    this.ws.close();
  }
}

export const is =
  <K extends ServerMessage["t"]>(t: K) =>
  (m: ServerMessage): m is Extract<ServerMessage, { t: K }> =>
    m.t === t;
