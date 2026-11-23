import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyEvent,
  connect,
  decide,
  disconnect,
  hasGap,
  initialSync,
  PROTOCOL_VERSION,
  pull,
  receive,
  submit,
  uuidv7,
  view,
  type BoardEvent,
  type BoardState,
  type ClientMessage,
  type Operation,
  type ServerMessage,
  type SyncState,
} from "../src";
import { threeColumns } from "./helpers";

/** The server's side, reduced to what the protocol promises. */
class ModelServer {
  events: BoardEvent[] = [];
  byClientOp = new Map<string, BoardEvent>();
  subscribed = new Set<number>();

  constructor(
    public state: BoardState,
    private readonly snapshotAfter: number,
  ) {}

  private catchUp(fromSeq: number): ServerMessage[] {
    if (fromSeq > this.state.seq || this.state.seq - fromSeq > this.snapshotAfter) {
      return [{ t: "snapshot", board: this.state }];
    }
    return this.events.filter((e) => e.seq > fromSeq).map((event) => ({ t: "event", event }));
  }

  /** Handles one message from client `from`; returns what each client receives, in order. */
  handle(from: number, message: ClientMessage, clients: number): ServerMessage[][] {
    const out: ServerMessage[][] = Array.from({ length: clients }, () => []);
    switch (message.t) {
      case "hello":
        this.subscribed.add(from);
        out[from]!.push(...this.catchUp(message.lastSeq), { t: "synced", seq: this.state.seq });
        break;
      case "pull":
        out[from]!.push(...this.catchUp(message.fromSeq));
        break;
      case "op": {
        const known = this.byClientOp.get(message.clientOpId);
        if (known) {
          out[from]!.push({
            t: "ack",
            clientOpId: message.clientOpId,
            result: { result: "applied", event: known },
          });
          break;
        }
        const decision = decide(this.state, message.op, `client-${from}`);
        if (decision.kind !== "event") {
          const result =
            decision.kind === "noop"
              ? ({ result: "noop", seq: this.state.seq } as const)
              : ({
                  result: "rejected",
                  code: decision.code,
                  seq: this.state.seq,
                  ...(decision.conflict ? { conflict: decision.conflict } : {}),
                } as const);
          out[from]!.push({ t: "ack", clientOpId: message.clientOpId, result });
          break;
        }
        const event = {
          ...decision.event,
          seq: this.state.seq + 1,
          clientOpId: message.clientOpId,
          actorId: `client-${from}`,
          at: "2026-11-22T00:00:00.000Z",
        } as BoardEvent;
        this.state = applyEvent(this.state, event);
        this.events.push(event);
        this.byClientOp.set(message.clientOpId, event);
        for (const client of this.subscribed) out[client]!.push({ t: "event", event });
        out[from]!.push({ t: "ack", clientOpId: message.clientOpId, result: { result: "applied", event } });
        break;
      }
      case "ping":
        out[from]!.push({ t: "pong" });
    }
    return out;
  }
}

interface Client {
  sync: SyncState;
  inbox: ServerMessage[];
  outbox: ClientMessage[];
  online: boolean;
}

// A small pool of ids so operations collide: cards created twice, moved into deleted columns, edited
// after deletion, dropped into the same gap.
const base = threeColumns();
const columns = [base.todo, base.doing, base.done, uuidv7()];
const cards = Array.from({ length: 6 }, () => uuidv7());
const col = fc.constantFrom(...columns);
const card = fc.constantFrom(...cards);
const near = fc.option(fc.constantFrom(...cards), { nil: null });
const operation: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({
    type: fc.constant("card.create" as const),
    cardId: card,
    columnId: col,
    title: fc.constantFrom("a", "b"),
    afterId: near,
    beforeId: near,
  }),
  fc.record({
    type: fc.constant("card.move" as const),
    cardId: card,
    toColumnId: col,
    afterId: near,
    beforeId: near,
  }),
  fc.record({
    type: fc.constant("card.update" as const),
    cardId: card,
    change: fc.record({ field: fc.constant("title" as const), value: fc.constantFrom("x", "y") }),
    // Edits based on an old version: same-field edits from different clients conflict.
    baseSeq: fc.nat({ max: 12 }),
  }),
  fc.record({ type: fc.constant("card.restore" as const), cardId: card, columnId: col }),
  fc.record({ type: fc.constant("card.delete" as const), cardId: card }),
  fc.record({ type: fc.constant("column.create" as const), columnId: col, title: fc.constant("Nova") }),
  fc.record({ type: fc.constant("column.delete" as const), columnId: col }),
  fc.record({ type: fc.constant("board.rename" as const), title: fc.constantFrom("Q1", "Q2") }),
);

const CLIENTS = 3;
const who = fc.nat({ max: CLIENTS - 1 });
const action = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("op" as const), client: who, op: operation }) },
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("serve" as const), client: who }) },
  { weight: 6, arbitrary: fc.record({ kind: fc.constant("deliver" as const), client: who, pick: fc.nat() }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant("duplicate" as const), client: who, pick: fc.nat() }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("drop" as const), client: who }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("reconnect" as const), client: who }) },
);

type Action = typeof action extends fc.Arbitrary<infer A> ? A : never;

function simulate(actions: Action[], snapshotAfter: number) {
  const server = new ModelServer(base.state, snapshotAfter);
  const clients: Client[] = Array.from({ length: CLIENTS }, () => ({
    sync: initialSync(base.state),
    inbox: [],
    outbox: [],
    online: false,
  }));

  const run = (i: number, result: { state: SyncState; send: ClientMessage[] }) => {
    clients[i]!.sync = result.state;
    if (clients[i]!.online) clients[i]!.outbox.push(...result.send);
  };
  const open = (i: number) => {
    clients[i]!.online = true;
    run(i, connect(clients[i]!.sync));
  };
  const serve = (i: number) => {
    const message = clients[i]!.outbox.shift();
    if (!message) return;
    server.handle(i, message, CLIENTS).forEach((messages, j) => {
      if (clients[j]!.online && server.subscribed.has(j)) clients[j]!.inbox.push(...messages);
    });
  };
  for (let i = 0; i < CLIENTS; i++) open(i);

  for (const a of actions) {
    const c = clients[a.client]!;
    switch (a.kind) {
      case "op":
        run(a.client, submit(c.sync, { clientOpId: uuidv7(), op: a.op }));
        break;
      case "serve":
        serve(a.client);
        break;
      case "deliver": // in any order: what a reconnect, a pull and live traffic can add up to
        if (c.inbox.length) run(a.client, receive(c.sync, c.inbox.splice(a.pick % c.inbox.length, 1)[0]!));
        break;
      case "duplicate":
        if (c.inbox.length) c.inbox.push(c.inbox[a.pick % c.inbox.length]!);
        break;
      case "drop": // whatever was in flight, both ways, is lost
        c.online = false;
        c.inbox = [];
        c.outbox = [];
        c.sync = disconnect(c.sync);
        server.subscribed.delete(a.client);
        break;
      case "reconnect":
        if (!c.online) open(a.client);
        break;
    }
  }

  // Then the network heals: everyone reconnects and messages flow in order until nothing moves.
  for (let i = 0; i < CLIENTS; i++) if (!clients[i]!.online) open(i);
  for (let round = 0; round < 10_000; round++) {
    let moved = false;
    for (let i = 0; i < CLIENTS; i++) {
      const c = clients[i]!;
      if (c.outbox.length) {
        serve(i);
        moved = true;
      } else if (c.inbox.length) {
        run(i, receive(c.sync, c.inbox.shift()!));
        moved = true;
      } else if (hasGap(c.sync)) {
        c.outbox.push(pull(c.sync));
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { server, clients };
}

describe("sync engine", () => {
  it.each([
    ["replaying events", 1_000],
    ["sending snapshots", 2],
  ])(
    "converges on the server's board under any delivery order, duplicates and drops (%s)",
    (_, snapshotAfter) => {
      fc.assert(
        fc.property(fc.array(action, { maxLength: 150 }), (actions) => {
          const { server, clients } = simulate(actions, snapshotAfter);
          for (const c of clients) {
            expect(c.sync.confirmed).toEqual(server.state);
            expect(view(c.sync)).toEqual(server.state);
            expect(c.sync.pending).toEqual([]);
            expect(c.sync.ahead).toEqual({});
            expect(c.sync.settled).toEqual({});
          }
          // No operation was applied twice, whatever got resent.
          expect(new Set(server.events.map((e) => e.clientOpId)).size).toBe(server.events.length);
        }),
        { numRuns: 300 },
      );
    },
  );

  it("starts with hello and the last seq it has", () => {
    const { state } = threeColumns();
    expect(connect(initialSync(state)).send).toEqual([
      { t: "hello", protocolVersion: PROTOCOL_VERSION, lastSeq: state.seq },
    ]);
  });

  it("holds operations until caught up, then sends them in order", () => {
    const { state, todo } = threeColumns();
    let sync = connect(initialSync(state)).state;
    const first = {
      clientOpId: uuidv7(),
      op: { type: "card.create", cardId: uuidv7(), columnId: todo, title: "1" } as Operation,
    };
    const second = { clientOpId: uuidv7(), op: { type: "board.rename", title: "2" } as Operation };
    let out = submit(sync, first);
    expect(out.send).toEqual([]);
    out = submit(out.state, second);
    out = receive(out.state, { t: "synced", seq: state.seq });
    expect(out.send.map((m) => (m.t === "op" ? m.clientOpId : m.t))).toEqual([
      first.clientOpId,
      second.clientOpId,
    ]);
    sync = out.state;
    expect(
      submit(sync, { clientOpId: uuidv7(), op: { type: "board.rename", title: "3" } }).send,
    ).toHaveLength(1);
  });

  it("keeps an op whose ack beat its event, until the event is applied", () => {
    const { state, todo } = threeColumns();
    const envelope = {
      clientOpId: uuidv7(),
      op: { type: "card.create", cardId: uuidv7(), columnId: todo, title: "x" } as Operation,
    };
    const decision = decide(state, envelope.op);
    if (decision.kind !== "event") throw new Error("expected an event");
    // Someone else's event (seq + 1) hasn't arrived; ours is seq + 2.
    const ours = {
      ...decision.event,
      seq: state.seq + 2,
      clientOpId: envelope.clientOpId,
      actorId: "me",
      at: "t",
    } as BoardEvent;
    let sync = { ...submit(initialSync(state), envelope).state, synced: true };
    sync = receive(sync, {
      t: "ack",
      clientOpId: envelope.clientOpId,
      result: { result: "applied", event: ours },
    }).state;
    expect(sync.pending).toHaveLength(1);
    expect(hasGap(sync)).toBe(true);
    expect(pull(sync)).toEqual({ t: "pull", fromSeq: state.seq });
  });

  it("reports a rejection once", () => {
    const { state } = threeColumns();
    const envelope = { clientOpId: uuidv7(), op: { type: "card.delete", cardId: uuidv7() } as Operation };
    const ack: ServerMessage = {
      t: "ack",
      clientOpId: envelope.clientOpId,
      result: { result: "rejected", code: "not_found", seq: state.seq },
    };
    const first = receive(submit(initialSync(state), envelope).state, ack);
    expect(first.rejected).toEqual([{ clientOpId: envelope.clientOpId, code: "not_found", op: envelope.op }]);
    expect(first.state.pending).toEqual([]);
    expect(receive(first.state, ack).rejected).toEqual([]);
  });

  it("never goes back to an older snapshot", () => {
    const { state } = threeColumns();
    const newer = { ...state, seq: state.seq + 5, title: "Mais novo" };
    const sync = receive(initialSync(newer), { t: "snapshot", board: state }).state;
    expect(sync.confirmed).toBe(newer);
  });

  it("keeps showing an op the server called a no-op until the board catches up", () => {
    const { state } = threeColumns();
    const envelope = { clientOpId: uuidv7(), op: { type: "board.rename", title: "Igual" } as Operation };
    // Someone else renamed it to the same title at seq + 1, which we haven't received yet.
    let sync = { ...submit(initialSync(state), envelope).state, synced: true };
    sync = receive(sync, {
      t: "ack",
      clientOpId: envelope.clientOpId,
      result: { result: "noop", seq: state.seq + 1 },
    }).state;
    expect(view(sync).title).toBe("Igual"); // no flicker back to the old title
    const theirs = {
      type: "board.renamed",
      payload: { title: "Igual", previousTitle: state.title },
      seq: state.seq + 1,
      clientOpId: uuidv7(),
      actorId: "bruno",
      at: "t",
    } as BoardEvent;
    sync = receive(sync, { t: "event", event: theirs }).state;
    expect(sync.pending).toEqual([]);
    expect(sync.settled).toEqual({});
    expect(view(sync).title).toBe("Igual");
  });
});
