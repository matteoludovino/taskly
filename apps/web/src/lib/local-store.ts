import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  envelope,
  type BoardState,
  type Envelope,
  type ParticipantState,
  type SyncState,
} from "@taskly/shared";

/**
 * What a browser keeps of each board, so a reload (or opening it with no network) doesn't lose
 * anything: the confirmed board, the operations not yet confirmed, and each description document.
 * Records carry a schema version; pending operations are re-validated when read, because the server
 * will only accept them in the current shape.
 */
export const LOCAL_SCHEMA = 1;
const KEEP_FOR_MS = 30 * 24 * 60 * 60 * 1000;

export interface SavedBoard {
  schema: number;
  boardId: string;
  me: ParticipantState;
  confirmed: BoardState;
  pending: Envelope[];
  settled: Record<string, number>;
  /** When a demo board disappears (null for regular boards). */
  expiresAt?: string | null;
  savedAt: number;
}

export interface SavedDoc {
  key: string;
  boardId: string;
  cardId: string;
  state: Uint8Array;
  savedAt: number;
}

interface TasklyDb extends DBSchema {
  boards: { key: string; value: SavedBoard };
  docs: { key: string; value: SavedDoc; indexes: { boardId: string } };
}

let opening: Promise<IDBPDatabase<TasklyDb> | null> | undefined;

/** The database, or null where IndexedDB isn't available (private modes, old browsers): then nothing persists. */
export function localDb(): Promise<IDBPDatabase<TasklyDb> | null> {
  opening ??= (async () => {
    try {
      if (typeof indexedDB === "undefined") return null;
      return await openDB<TasklyDb>("taskly", 1, {
        upgrade(db) {
          db.createObjectStore("boards", { keyPath: "boardId" });
          db.createObjectStore("docs", { keyPath: "key" }).createIndex("boardId", "boardId");
        },
      });
    } catch {
      return null;
    }
  })();
  return opening;
}

const docKey = (boardId: string, cardId: string) => `${boardId}:${cardId}`;

export interface Restored {
  /** Null when the saved board can't be used (older format): fetch a fresh one, keep the operations. */
  board: {
    confirmed: BoardState;
    settled: Record<string, number>;
    me: ParticipantState;
    expiresAt: string | null;
  } | null;
  pending: Envelope[];
  /** Saved operations that no longer have a valid shape and were left out. */
  dropped: number;
}

/** Makes sense of a saved record (pure: what the store read, checked). */
export function restore(saved: unknown): Restored | null {
  if (!saved || typeof saved !== "object") return null;
  const record = saved as Partial<SavedBoard>;
  const pending: Envelope[] = [];
  let dropped = 0;
  for (const item of Array.isArray(record.pending) ? record.pending : []) {
    const parsed = envelope.safeParse(item);
    if (parsed.success) pending.push(parsed.data);
    else dropped += 1;
  }
  const usable = record.schema === LOCAL_SCHEMA && record.confirmed && record.me;
  return {
    board: usable
      ? {
          confirmed: record.confirmed!,
          settled: record.settled ?? {},
          me: record.me!,
          expiresAt: record.expiresAt ?? null,
        }
      : null,
    pending,
    dropped,
  };
}

export async function loadBoard(boardId: string): Promise<Restored | null> {
  const db = await localDb();
  return restore(await db?.get("boards", boardId).catch(() => undefined));
}

export async function saveBoard(
  boardId: string,
  me: ParticipantState,
  sync: SyncState,
  expiresAt: string | null = null,
): Promise<void> {
  const db = await localDb();
  await db
    ?.put("boards", {
      schema: LOCAL_SCHEMA,
      boardId,
      me,
      confirmed: sync.confirmed,
      pending: sync.pending,
      settled: sync.settled,
      expiresAt,
      savedAt: Date.now(),
    })
    .catch(() => undefined);
}

/** Drops everything kept for a board (it's gone, or this browser lost access to it). */
export async function forgetBoard(boardId: string): Promise<void> {
  const db = await localDb();
  if (!db) return;
  const tx = db.transaction(["boards", "docs"], "readwrite");
  await Promise.all([
    tx.objectStore("boards").delete(boardId),
    tx
      .objectStore("docs")
      .index("boardId")
      .getAllKeys(boardId)
      .then((keys) => Promise.all(keys.map((key) => tx.objectStore("docs").delete(key)))),
    tx.done,
  ]).catch(() => undefined);
}

export async function loadDoc(boardId: string, cardId: string): Promise<Uint8Array | null> {
  const db = await localDb();
  const saved = await db?.get("docs", docKey(boardId, cardId)).catch(() => undefined);
  return saved ? new Uint8Array(saved.state) : null;
}

export async function saveDoc(boardId: string, cardId: string, state: Uint8Array): Promise<void> {
  const db = await localDb();
  await db
    ?.put("docs", { key: docKey(boardId, cardId), boardId, cardId, state, savedAt: Date.now() })
    .catch(() => undefined);
}

/** Old boards and documents (untouched for 30 days) are removed. */
export async function cleanUp(now = Date.now()): Promise<void> {
  const db = await localDb();
  if (!db) return;
  const cutoff = now - KEEP_FOR_MS;
  const tx = db.transaction(["boards", "docs"], "readwrite");
  for (const board of await tx.objectStore("boards").getAll()) {
    if (board.savedAt < cutoff) await tx.objectStore("boards").delete(board.boardId);
  }
  for (const doc of await tx.objectStore("docs").getAll()) {
    if (doc.savedAt < cutoff) await tx.objectStore("docs").delete(doc.key);
  }
  await tx.done;
}

/**
 * Runs `whileHeld` only in the one tab that holds this board's lock (the others wait their turn), so
 * two tabs never overwrite each other's saved operations. Without the Web Locks API, every tab saves.
 */
export function holdBoard(boardId: string, whileHeld: () => () => void): () => void {
  if (typeof navigator === "undefined" || !navigator.locks) {
    const stop = whileHeld();
    return stop;
  }
  let release: () => void = () => {};
  let stop: (() => void) | undefined;
  let cancelled = false;
  const controller = new AbortController();
  void navigator.locks
    .request(`taskly:board:${boardId}`, { signal: controller.signal }, () => {
      if (cancelled) return;
      stop = whileHeld();
      return new Promise<void>((resolve) => (release = resolve));
    })
    .catch(() => undefined); // aborted while waiting
  return () => {
    cancelled = true;
    controller.abort();
    stop?.();
    release();
  };
}
