import {
  connect,
  disconnect,
  hasGap,
  initialSync,
  pull,
  receive,
  submit,
  uuidv7,
  view,
  type BoardEvent,
  type BoardSnapshot,
  type ClientMessage,
  type Operation,
  type ServerMessage,
  type SyncOutput,
  type SyncState,
  type TicketResponse,
} from "@taskly/shared";
import WebSocket from "ws";

export interface BotOptions {
  /** The web app's origin (REST goes through its /api, like a browser's). */
  origin: string;
  boardId: string;
  key: string;
  name: string;
  color?: string;
  log?: (line: string) => void;
  /** Extra request headers (the load test gives each bot its own X-Forwarded-For). */
  headers?: Record<string, string>;
  /** Called with every event this bot receives (live, catch-up or ack). */
  onEvent?: (event: BoardEvent) => void;
}

/**
 * A participant driven by code instead of a person, speaking the same protocol as the browser through
 * the same sync engine. A test tool: watch a board move on its own, or hammer it with concurrent edits.
 */
export class BotClient {
  sync: SyncState | null = null;
  synced = false;
  private cookie = "";
  private ws: WebSocket | null = null;
  private gapTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: BotOptions) {}

  private log(line: string) {
    this.options.log?.(`[${this.options.name}] ${line}`);
  }

  private async rest<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<{ data: T; headers: Headers }> {
    const response = await fetch(`${this.options.origin}/api${path}`, {
      method,
      headers: {
        ...this.options.headers,
        origin: this.options.origin,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${await response.text()}`);
    return { data: (await response.json()) as T, headers: response.headers };
  }

  async join(): Promise<void> {
    const { boardId, key, name, color = "#7c3aed" } = this.options;
    const { headers } = await this.rest(`/boards/${boardId}/join`, "POST", { key, name, color });
    this.cookie = headers.getSetCookie()[0]!.split(";")[0]!;
    const { data } = await this.rest<BoardSnapshot>(`/boards/${boardId}`);
    this.sync = initialSync(data.board);
    this.log(`joined at seq ${data.board.seq}`);
  }

  async open(): Promise<void> {
    const { data } = await this.rest<TicketResponse>(`/boards/${this.options.boardId}/ticket`, "POST");
    const ws = new WebSocket(data.url, { origin: this.options.origin, headers: this.options.headers ?? {} });
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.on("message", (raw) => this.onMessage(JSON.parse(raw.toString()) as ServerMessage));
    ws.on("close", (code) => {
      this.synced = false;
      if (this.sync) this.sync = disconnect(this.sync);
      this.log(`closed (${code})`);
    });
    this.run(connect(this.sync!));
  }

  submit(op: Operation): void {
    this.submitEnvelope({ clientOpId: uuidv7(), op });
  }

  submitEnvelope(envelope: { clientOpId: string; op: Operation }): void {
    this.run(submit(this.sync!, envelope));
  }

  /** The board as this bot sees it (confirmed plus its own pending changes). */
  board() {
    return view(this.sync!);
  }

  /** Resolves when everything this bot sent is confirmed and nothing is missing. */
  async settled(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.synced || this.sync!.pending.length > 0 || hasGap(this.sync!)) {
      if (Date.now() > deadline) throw new Error(`${this.options.name} did not settle`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  close(): void {
    clearTimeout(this.gapTimer);
    this.ws?.close();
  }

  private run(output: SyncOutput) {
    this.sync = output.state;
    for (const message of output.send) this.send(message);
    for (const { code } of output.rejected) this.log(`rejected: ${code}`);
  }

  private send(message: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private onMessage(message: ServerMessage) {
    this.run(receive(this.sync!, message));
    if (message.t === "event") this.options.onEvent?.(message.event);
    if (message.t === "synced") this.synced = true;
    if (message.t === "event" && message.event.actorId && message.event.clientOpId) {
      this.log(`#${message.event.seq} ${message.event.type}`);
    }
    if (hasGap(this.sync!) && !this.gapTimer) {
      this.gapTimer = setTimeout(() => {
        this.gapTimer = undefined;
        if (hasGap(this.sync!)) this.send(pull(this.sync!));
      }, 1500);
    }
  }
}
