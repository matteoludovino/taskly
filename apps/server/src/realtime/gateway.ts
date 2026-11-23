import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import {
  CLOSE,
  clientMessage,
  decodeFrame,
  FRAME,
  isSupportedProtocol,
  type BoardState,
  type ClientMessage,
  type Focus,
  type ServerMessage,
} from "@taskly/shared";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { BoardNotFound, type BoardStore } from "../boards/store.ts";
import type { DocHub, Peer } from "../collab/hub.ts";
import { Rooms, type Member } from "./rooms.ts";
import type { Grant, Tickets } from "./tickets.ts";

export interface GatewayOptions {
  origins: string[];
  tickets: Tickets;
  /** Catch a client up with a snapshot instead of events when it's this far behind. */
  snapshotAfter: number;
  heartbeatMs: number;
  /** Close a connection whose unsent backlog grows past this (it reconnects and catches up). */
  maxBufferedBytes: number;
}

const MAX_JSON_BYTES = 64 * 1024;
const MAX_FRAME_BYTES = 1024 * 1024;

/** Token bucket: a burst of `capacity` messages, refilled at `perSecond`. */
class Budget {
  private tokens: number;
  private last = Date.now();
  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {
    this.tokens = capacity;
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

function refuse(socket: Duplex, status: 401 | 403 | 404, text: string) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

class Session implements Member, Peer {
  readonly boardId: string;
  readonly participantId: string;
  alive = true;
  focus: Focus | null = null;
  private live = false;
  private readonly budget = new Budget(60, 30);
  // Typing makes many small document updates; cursors move even more: each has its own allowance.
  private readonly syncBudget = new Budget(400, 200);
  private readonly awarenessBudget = new Budget(60, 30);
  /** Document frames are handled one at a time, in arrival order (subscribe, then sync…). */
  private binary: Promise<void> = Promise.resolve();

  constructor(
    private readonly ws: WebSocket,
    grant: Grant,
    private readonly gateway: Gateway,
  ) {
    this.boardId = grant.boardId;
    this.participantId = grant.participantId;
  }

  get log(): FastifyBaseLogger {
    return this.gateway.log.child({ boardId: this.boardId, participantId: this.participantId });
  }

  sendBinary(data: Uint8Array): void {
    this.sendRaw(data);
  }

  sendRaw(data: string | Uint8Array): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    if (this.ws.bufferedAmount > this.gateway.options.maxBufferedBytes) {
      this.close(CLOSE.tooSlow, "too slow");
      return;
    }
    this.ws.send(data);
  }

  send(message: ServerMessage): void {
    this.sendRaw(JSON.stringify(message));
  }

  close(code: number, reason: string): void {
    this.ws.close(code, reason);
  }

  async onMessage(data: RawData, isBinary: boolean): Promise<void> {
    this.alive = true;
    const size = Array.isArray(data) ? data.reduce((n, b) => n + b.length, 0) : data.byteLength;
    if (isBinary) return this.onBinary(data);
    if (size > MAX_JSON_BYTES) return this.close(CLOSE.violation, "message too large");
    if (!this.budget.take()) return this.close(CLOSE.violation, "too many messages");
    let parsed: ClientMessage;
    try {
      const result = clientMessage.safeParse(JSON.parse(data.toString()));
      if (!result.success) return this.close(CLOSE.violation, "invalid message");
      parsed = result.data;
    } catch {
      return this.close(CLOSE.violation, "invalid JSON");
    }
    try {
      await this.handle(parsed);
    } catch (error) {
      if (error instanceof BoardNotFound) return this.close(CLOSE.gone, "board gone");
      this.log.error({ err: error }, "websocket message failed");
      this.close(1011, "internal error");
    }
  }

  private onBinary(data: RawData): void {
    if (!this.live) return this.close(CLOSE.violation, "hello first");
    const bytes = Array.isArray(data)
      ? new Uint8Array(Buffer.concat(data))
      : new Uint8Array(
          data instanceof ArrayBuffer
            ? data
            : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        );
    const parsed = decodeFrame(bytes);
    if (!parsed) return this.close(CLOSE.violation, "invalid frame");
    const budget = parsed.type === FRAME.awareness ? this.awarenessBudget : this.syncBudget;
    // Over budget: close the connection rather than drop an update (the client reconnects and resyncs).
    if (!budget.take()) return this.close(CLOSE.violation, "too many updates");
    this.binary = this.binary
      .then(() => this.gateway.docs.handle(this, parsed))
      .catch((error: unknown) => this.log.error({ err: error }, "document frame failed"));
  }

  private async handle(message: ClientMessage): Promise<void> {
    const { store, rooms } = this.gateway;
    if (!this.live && message.t !== "hello" && message.t !== "ping") {
      return this.close(CLOSE.violation, "hello first");
    }
    switch (message.t) {
      case "hello": {
        if (this.live) return this.close(CLOSE.violation, "hello twice");
        if (!isSupportedProtocol(message.protocolVersion))
          return this.close(CLOSE.outdated, "outdated client");
        // Catch up and subscribe inside the board's queue: no event can be committed in between, so
        // the client gets every event exactly once (missed ones now, the rest live).
        const newlyOnline = await store.exclusive(this.boardId, async (state) => {
          for (const m of await this.gateway.catchUp(state, message.lastSeq)) this.send(m);
          this.send({ t: "synced", seq: state.seq });
          this.live = true;
          return rooms.join(this);
        });
        if (newlyOnline) this.gateway.announcePresence(this.boardId);
        else this.send(this.gateway.presence(this.boardId));
        this.log.info("synced");
        this.gateway.membershipChanged(this.boardId);
        return;
      }
      case "op": {
        const result = await store.apply(this.boardId, this.participantId, {
          clientOpId: message.clientOpId,
          op: message.op,
        });
        // The event (if any) was broadcast inside apply(), so it reaches this client before the ack.
        this.send({ t: "ack", clientOpId: message.clientOpId, result });
        return;
      }
      case "pull":
        await store.exclusive(this.boardId, async (state) => {
          for (const m of await this.gateway.catchUp(state, message.fromSeq)) this.send(m);
        });
        return;
      case "ping":
        this.send({ t: "pong" });
        return;
      case "focus": {
        const changed = JSON.stringify(this.focus) !== JSON.stringify(message.focus);
        this.focus = message.focus;
        if (changed) this.gateway.announcePresence(this.boardId);
      }
    }
  }

  onClose(code: number): void {
    // Leaving drops this connection's focus too: tell the others if anything they see changed.
    if (this.gateway.rooms.leave(this) || this.focus) this.gateway.announcePresence(this.boardId);
    this.binary = this.binary.then(() => this.gateway.docs.leaveAll(this));
    this.gateway.membershipChanged(this.boardId);
    this.log.info({ code }, "websocket closed");
  }

  /** Called on each heartbeat: a socket that didn't answer the previous ping is dead. */
  heartbeat(): void {
    if (!this.alive) {
      this.ws.terminate();
      return;
    }
    this.alive = false;
    this.ws.ping();
  }
}

export class Gateway {
  readonly rooms = new Rooms();
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  private readonly sessions = new Set<Session>();
  private readonly timer: NodeJS.Timeout;

  constructor(
    readonly store: BoardStore,
    readonly docs: DocHub,
    readonly options: GatewayOptions,
    readonly log: FastifyBaseLogger,
  ) {
    store.onEvent((boardId, event) => this.rooms.broadcast(boardId, { t: "event", event }));
    this.timer = setInterval(() => this.sessions.forEach((s) => s.heartbeat()), options.heartbeatMs);
    this.timer.unref();
  }

  /** Handles an HTTP upgrade request: checks Origin and ticket before any WebSocket exists. */
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") return refuse(socket, 404, "Not Found");
    if (!this.options.origins.includes(request.headers.origin ?? "")) return refuse(socket, 403, "Forbidden");
    const grant = this.options.tickets.redeem(url.searchParams.get("ticket"));
    if (!grant) return refuse(socket, 401, "Unauthorized");
    this.wss.handleUpgrade(request, socket, head, (ws) => this.accept(ws, grant));
  }

  private accept(ws: WebSocket, grant: Grant) {
    const session = new Session(ws, grant, this);
    this.sessions.add(session);
    ws.on("message", (data, isBinary) => void session.onMessage(data, isBinary));
    ws.on("pong", () => (session.alive = true));
    ws.on("error", (error) => session.log.warn({ err: error }, "websocket error"));
    ws.on("close", (code) => {
      this.sessions.delete(session);
      session.onClose(code);
    });
    session.log.info("websocket open");
  }

  /** What a client that has everything up to `fromSeq` needs: the events since, or a snapshot. */
  async catchUp(state: BoardState, fromSeq: number): Promise<ServerMessage[]> {
    if (fromSeq > state.seq || state.seq - fromSeq > this.options.snapshotAfter) {
      return [{ t: "snapshot", board: state }];
    }
    if (fromSeq === state.seq) return [];
    const events = await this.store.eventsAfter(state.id, fromSeq);
    return events.map((event) => ({ t: "event", event }));
  }

  presence(boardId: string): ServerMessage {
    return { t: "presence", online: this.rooms.online(boardId), activity: this.rooms.activity(boardId) };
  }

  /** Someone joined or left a board (the demo's teammate starts and stops with its people). */
  membershipChanged(boardId: string): void {
    void this.onMembership?.(boardId);
  }

  onMembership: ((boardId: string) => Promise<void> | void) | undefined;
  /** Runs first on shutdown (the simulated teammates stop before documents are saved). */
  beforeShutdown: (() => void) | undefined;

  announcePresence(boardId: string): void {
    this.rooms.broadcast(boardId, this.presence(boardId));
  }

  /** Server shutting down (deploy): tell clients to come right back. */
  close(): void {
    clearInterval(this.timer);
    for (const session of this.sessions) session.close(CLOSE.restarting, "restarting");
    this.wss.close();
  }
}

export function installGateway(
  app: FastifyInstance,
  store: BoardStore,
  docs: DocHub,
  options: GatewayOptions,
): Gateway {
  const gateway = new Gateway(store, docs, options, app.log);
  app.server.on("upgrade", (request, socket, head) => gateway.upgrade(request, socket, head));
  // Before the HTTP server closes (it waits for open sockets, and these only close when told to):
  // save every open description and close its edit session, then send everyone 1012.
  app.addHook("preClose", async () => {
    gateway.beforeShutdown?.();
    await docs.flushAll();
    gateway.close();
  });
  return gateway;
}
