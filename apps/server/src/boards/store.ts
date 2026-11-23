import {
  applyEvent,
  decide,
  type BoardEvent,
  type BoardState,
  type Envelope,
  type EventBody,
  type OpResult,
} from "@taskly/shared";
import type { Db } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { writesFor } from "./persist.ts";
import { KeyedQueue } from "./queue.ts";
import { loadBoard } from "./snapshot.ts";

export class BoardNotFound extends Error {
  constructor(readonly boardId: string) {
    super(`Board ${boardId} not found`);
  }
}

type Write = Prisma.PrismaPromise<unknown>;
export type EventListener = (boardId: string, event: BoardEvent) => void;

function rowFromDb(row: {
  seq: number;
  clientOpId: string | null;
  actorId: string | null;
  type: string;
  payload: unknown;
  createdAt: Date;
}): BoardEvent {
  return {
    seq: row.seq,
    clientOpId: row.clientOpId,
    actorId: row.actorId,
    type: row.type,
    payload: row.payload,
    at: row.createdAt.toISOString(),
  } as BoardEvent;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * The one way anything changes on a board: REST, WebSocket and the server's own events all come here.
 *
 * Boards in use live in memory. Each write runs in the board's queue: decide against the in-memory board,
 * persist the event and its row changes in one batch, then update memory. Readers get immutable
 * snapshots, so they never see a half-applied event.
 */
export class BoardStore {
  private readonly cache = new Map<string, BoardState>();
  private readonly queue = new KeyedQueue();
  private readonly listeners = new Set<EventListener>();

  constructor(
    private readonly db: Db,
    private readonly maxCached = 200,
  ) {}

  /** The board as of its last event, or null if it doesn't exist. */
  get(boardId: string): Promise<BoardState | null> {
    return this.queue.run(boardId, () => this.load(boardId));
  }

  /** Applies a client operation. Resending the same clientOpId returns the original event. */
  apply(boardId: string, actorId: string, envelope: Envelope): Promise<OpResult> {
    return this.queue.run(boardId, () =>
      this.withRetry(boardId, () => this.applyNow(boardId, actorId, envelope)),
    );
  }

  /**
   * Records an event the server makes on its own (someone joining, for instance), with extra writes in the
   * same transaction.
   */
  record(
    boardId: string,
    body: EventBody,
    actorId: string | null,
    extra: (db: Db) => Write[] = () => [],
  ): Promise<BoardEvent> {
    return this.queue.run(boardId, () =>
      this.withRetry(boardId, async () =>
        this.commit(await this.require(boardId), body, actorId, null, extra),
      ),
    );
  }

  /**
   * Called with every event right after it's committed, still inside the board's queue: listeners see
   * events in seq order, and nothing else happens on the board while they run.
   */
  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Runs `task` in the board's queue with its current state: no write can land while it runs. Used to
   * catch a connection up and subscribe it in one step, so no event falls in between.
   */
  exclusive<T>(boardId: string, task: (state: BoardState) => Promise<T> | T): Promise<T> {
    return this.queue.run(boardId, async () => task(await this.require(boardId)));
  }

  /** The recorded events after `fromSeq`, in order. */
  async eventsAfter(boardId: string, fromSeq: number): Promise<BoardEvent[]> {
    const rows = await this.db.boardEvent.findMany({
      where: { boardId, seq: { gt: fromSeq } },
      orderBy: { seq: "asc" },
    });
    return rows.map(rowFromDb);
  }

  /** Forgets a board's in-memory copy; the next access reloads it from the database. */
  evict(boardId: string): void {
    this.cache.delete(boardId);
  }

  private async applyNow(boardId: string, actorId: string, envelope: Envelope): Promise<OpResult> {
    const recorded = await this.db.boardEvent.findUnique({
      where: { boardId_clientOpId: { boardId, clientOpId: envelope.clientOpId } },
    });
    if (recorded) return { result: "applied", event: rowFromDb(recorded) };

    const state = await this.require(boardId);
    const decision = decide(state, envelope.op, actorId);
    if (decision.kind === "noop") return { result: "noop", seq: state.seq };
    if (decision.kind === "rejected") {
      const { code, conflict } = decision;
      return { result: "rejected", code, seq: state.seq, ...(conflict ? { conflict } : {}) };
    }
    const event = await this.commit(state, decision.event, actorId, envelope.clientOpId);
    return { result: "applied", event };
  }

  /**
   * A unique violation means someone else wrote to this board since we loaded it (another instance, a
   * manual fix): reload and run the whole thing again, once.
   */
  private async withRetry<T>(boardId: string, task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      this.evict(boardId);
      return task();
    }
  }

  private async commit(
    state: BoardState,
    body: EventBody,
    actorId: string | null,
    clientOpId: string | null,
    extra: (db: Db) => Write[] = () => [],
  ): Promise<BoardEvent> {
    const event = {
      ...body,
      seq: state.seq + 1,
      clientOpId,
      actorId,
      at: new Date().toISOString(),
    } as BoardEvent;
    const next = applyEvent(state, event);
    await this.db.$transaction(writesFor(this.db, event, next, extra(this.db)));
    this.remember(state.id, next);
    for (const listener of this.listeners) {
      try {
        listener(state.id, event);
      } catch {
        // A broken listener must not undo or block a committed write.
      }
    }
    return event;
  }

  private async load(boardId: string): Promise<BoardState | null> {
    const cached = this.cache.get(boardId);
    if (cached) {
      this.remember(boardId, cached);
      return cached;
    }
    const state = await loadBoard(this.db, boardId);
    if (state) this.remember(boardId, state);
    return state;
  }

  private async require(boardId: string): Promise<BoardState> {
    const state = await this.load(boardId);
    if (!state) throw new BoardNotFound(boardId);
    return state;
  }

  /** Least recently used boards drop out first. */
  private remember(boardId: string, state: BoardState) {
    this.cache.delete(boardId);
    this.cache.set(boardId, state);
    while (this.cache.size > this.maxCached) this.cache.delete(this.cache.keys().next().value!);
  }
}
