import { descriptionPreview, encodeFrame, FRAME, type DeniedReason, type Frame } from "@taskly/shared";
import type { FastifyBaseLogger } from "fastify";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import type { BoardStore } from "../boards/store.ts";
import type { Db } from "../db.ts";
import { plainText } from "./text.ts";

/** A connection that can hold documents open (a WebSocket session). */
export interface Peer {
  readonly boardId: string;
  readonly participantId: string;
  sendBinary(data: Uint8Array): void;
}

export interface HubOptions {
  /** Save this long after the last change (changes in between are saved together). */
  saveDebounceMs: number;
  /** An edit session ends (and is recorded in the history) after this long without changes. */
  sessionIdleMs: number;
  /** Drop a document from memory this long after its last reader left. */
  unloadAfterMs: number;
  /** One update can't be larger than this… */
  maxUpdateBytes: number;
  /** …and past this many characters a document stops accepting changes (the editor stops far earlier). */
  maxChars: number;
}

class Room {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  /** Each peer, and the awareness client ids it controls (removed when it leaves). */
  readonly peers = new Map<Peer, Set<number>>();
  readonly editors = new Set<string>();
  dirty = false;
  tooLarge = false;
  textAtSessionStart = "";
  saveTimer: NodeJS.Timeout | undefined;
  idleTimer: NodeJS.Timeout | undefined;
  unloadTimer: NodeJS.Timeout | undefined;
  saving: Promise<void> = Promise.resolve();

  constructor(
    readonly boardId: string,
    readonly cardId: string,
  ) {
    // The server is a relay and a store, never an editor: its own awareness state is empty.
    this.awareness.setLocalState(null);
  }

  get key() {
    return `${this.boardId}:${this.cardId}`;
  }
}

function frame(
  type: (typeof FRAME)[keyof typeof FRAME],
  cardId: string,
  write: (e: encoding.Encoder) => void,
) {
  const encoder = encoding.createEncoder();
  write(encoder);
  return encodeFrame(type, cardId, encoding.toUint8Array(encoder));
}

/**
 * Collaborative descriptions: one Yjs document per card, kept in memory while someone has it open.
 *
 * Every update from a peer is applied and relayed to the others (never dropped: an update too big to
 * take closes that peer's subscription instead, with a reason). Saving merges with what's stored
 * (`SELECT … FOR UPDATE` + `Y.mergeUpdates`), so two processes saving the same card both keep their
 * changes. When someone stops editing for a while, the session goes into the board's history.
 */
export class DocHub {
  private readonly rooms = new Map<string, Promise<Room>>();

  constructor(
    private readonly db: Db,
    private readonly store: BoardStore,
    private readonly options: HubOptions,
    private readonly log: FastifyBaseLogger,
  ) {}

  async handle(peer: Peer, { type, docId, payload }: Frame): Promise<void> {
    switch (type) {
      case FRAME.subscribe:
        return this.subscribe(peer, docId);
      case FRAME.unsubscribe:
        return this.leave(peer, docId);
      case FRAME.sync:
      case FRAME.awareness: {
        const room = await this.rooms.get(`${peer.boardId}:${docId}`);
        if (!room?.peers.has(peer)) return; // not subscribed (or already denied): nothing to apply to
        return type === FRAME.sync ? this.sync(room, peer, payload) : this.aware(room, peer, payload);
      }
    }
  }

  /** The connection closed: leave every document it had open. */
  async leaveAll(peer: Peer): Promise<void> {
    for (const pending of [...this.rooms.values()]) {
      const room = await pending;
      if (room.peers.has(peer)) await this.leave(peer, room.cardId);
    }
  }

  /** Saves everything and closes every edit session (shutdown). */
  async flushAll(): Promise<void> {
    const rooms = await Promise.all(this.rooms.values());
    await Promise.all(
      rooms.map(async (room) => {
        clearTimeout(room.saveTimer);
        clearTimeout(room.unloadTimer);
        await this.save(room);
        await this.endSession(room);
      }),
    );
  }

  private deny(peer: Peer, cardId: string, reason: DeniedReason) {
    peer.sendBinary(encodeFrame(FRAME.denied, cardId, new TextEncoder().encode(reason)));
  }

  private async subscribe(peer: Peer, cardId: string): Promise<void> {
    // Only cards of the board this connection's ticket is for.
    const board = await this.store.get(peer.boardId);
    if (!board?.cards[cardId]) return this.deny(peer, cardId, "not_found");
    const room = await this.open(peer.boardId, cardId);
    if (room.tooLarge) return this.deny(peer, cardId, "too_large");
    clearTimeout(room.unloadTimer);
    room.peers.set(peer, room.peers.get(peer) ?? new Set());
    // Start the two-way sync (the client sends its own step 1 too), then show who's already here.
    peer.sendBinary(frame(FRAME.sync, cardId, (e) => syncProtocol.writeSyncStep1(e, room.doc)));
    const others = [...room.awareness.getStates().keys()];
    if (others.length) {
      const update = awarenessProtocol.encodeAwarenessUpdate(room.awareness, others);
      peer.sendBinary(encodeFrame(FRAME.awareness, cardId, update));
    }
  }

  private sync(room: Room, peer: Peer, payload: Uint8Array) {
    const kind = decoding.readVarUint(decoding.createDecoder(payload));
    const carriesUpdate = kind === syncProtocol.messageYjsSyncStep2 || kind === syncProtocol.messageYjsUpdate;
    if (carriesUpdate && (room.tooLarge || payload.length > this.options.maxUpdateBytes)) {
      return this.close(room, peer, "too_large");
    }
    const reply = encoding.createEncoder();
    syncProtocol.readSyncMessage(decoding.createDecoder(payload), reply, room.doc, peer);
    if (encoding.length(reply) > 0)
      peer.sendBinary(encodeFrame(FRAME.sync, room.cardId, encoding.toUint8Array(reply)));
    if (carriesUpdate && plainText(room.doc).length > this.options.maxChars) {
      // Coarse guard (the editor stops at a fraction of this): keep what's there, accept nothing more.
      room.tooLarge = true;
      for (const other of [...room.peers.keys()]) this.close(room, other, "too_large");
    }
  }

  private aware(room: Room, peer: Peer, payload: Uint8Array) {
    awarenessProtocol.applyAwarenessUpdate(room.awareness, payload, peer);
  }

  /** Ends one peer's subscription and tells it why. */
  private close(room: Room, peer: Peer, reason: DeniedReason) {
    this.deny(peer, room.cardId, reason);
    void this.leave(peer, room.cardId);
  }

  private async leave(peer: Peer, cardId: string): Promise<void> {
    const room = await this.rooms.get(`${peer.boardId}:${cardId}`);
    const ids = room?.peers.get(peer);
    if (!room || !ids) return;
    room.peers.delete(peer);
    // Their cursors go away for everyone else.
    if (ids.size) awarenessProtocol.removeAwarenessStates(room.awareness, [...ids], null);
    if (room.peers.size > 0) return;
    clearTimeout(room.saveTimer);
    await this.save(room);
    await this.endSession(room);
    room.unloadTimer = setTimeout(() => {
      if (room.peers.size === 0 && !room.dirty) {
        this.rooms.delete(room.key);
        room.doc.destroy();
      }
    }, this.options.unloadAfterMs);
    room.unloadTimer.unref();
  }

  private open(boardId: string, cardId: string): Promise<Room> {
    const key = `${boardId}:${cardId}`;
    let pending = this.rooms.get(key);
    if (!pending) {
      pending = this.load(boardId, cardId);
      this.rooms.set(key, pending);
      pending.catch(() => this.rooms.delete(key));
    }
    return pending;
  }

  private async load(boardId: string, cardId: string): Promise<Room> {
    const room = new Room(boardId, cardId);
    const row = await this.db.card.findUnique({
      where: { boardId_id: { boardId, id: cardId } },
      select: { descriptionDoc: true },
    });
    if (row?.descriptionDoc) Y.applyUpdate(room.doc, row.descriptionDoc, "db");
    room.textAtSessionStart = plainText(room.doc);
    room.tooLarge = room.textAtSessionStart.length > this.options.maxChars;

    room.doc.on("update", (update: Uint8Array, origin: unknown) => {
      const data = frame(FRAME.sync, cardId, (e) => syncProtocol.writeUpdate(e, update));
      for (const peer of room.peers.keys()) if (peer !== origin) peer.sendBinary(data);
      if (origin === "db") return; // already stored
      room.dirty = true;
      clearTimeout(room.saveTimer);
      room.saveTimer = setTimeout(() => void this.save(room), this.options.saveDebounceMs);
      room.saveTimer.unref();
      if (origin && typeof origin === "object" && "participantId" in origin) {
        room.editors.add((origin as Peer).participantId);
        clearTimeout(room.idleTimer);
        room.idleTimer = setTimeout(() => void this.endSession(room), this.options.sessionIdleMs);
        room.idleTimer.unref();
      }
    });

    room.awareness.on("update", ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
      const ids = room.peers.get(origin as Peer);
      if (ids) {
        added.forEach((id) => ids.add(id));
        removed.forEach((id) => ids.delete(id));
      }
      const changed = [...added, ...updated, ...removed];
      const data = encodeFrame(
        FRAME.awareness,
        cardId,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed),
      );
      for (const peer of room.peers.keys()) if (peer !== origin) peer.sendBinary(data);
    });
    return room;
  }

  /** Saves by merging with what's stored, one save at a time per document. */
  private save(room: Room): Promise<void> {
    room.saving = room.saving.then(async () => {
      if (!room.dirty) return;
      room.dirty = false;
      try {
        const stored = await this.merge(room);
        // Bring in what another process had stored, so the people here get it too.
        if (stored) Y.applyUpdate(room.doc, stored, "db");
      } catch (error) {
        room.dirty = true;
        this.log.error(
          { err: error, boardId: room.boardId, cardId: room.cardId },
          "saving a description failed",
        );
      }
    });
    return room.saving;
  }

  private merge(room: Room): Promise<Uint8Array | null> {
    const mine = Y.encodeStateAsUpdate(room.doc);
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ descriptionDoc: Uint8Array | null }[]>`
        SELECT "descriptionDoc" FROM cards
        WHERE "boardId" = ${room.boardId} AND id = ${room.cardId}::uuid
        FOR UPDATE`;
      if (rows.length === 0) return null; // the card is gone
      const stored = rows[0]!.descriptionDoc;
      const merged = stored ? Y.mergeUpdates([stored, mine]) : mine;
      const doc = new Y.Doc();
      Y.applyUpdate(doc, merged);
      const text = plainText(doc);
      doc.destroy();
      await tx.$executeRaw`
        UPDATE cards SET "descriptionDoc" = ${Buffer.from(merged)}, "descriptionText" = ${text}
        WHERE "boardId" = ${room.boardId} AND id = ${room.cardId}::uuid`;
      return stored ? new Uint8Array(stored) : null;
    });
  }

  /** Records the edit session in the board's history (one event per person who edited). */
  private async endSession(room: Room): Promise<void> {
    clearTimeout(room.idleTimer);
    const text = plainText(room.doc);
    const editors = [...room.editors];
    room.editors.clear();
    if (editors.length === 0 || text === room.textAtSessionStart) return;
    room.textAtSessionStart = text;
    const board = await this.store.get(room.boardId);
    const card = board?.cards[room.cardId];
    if (!card) return;
    const preview = descriptionPreview(text);
    for (const editor of editors) {
      await this.store
        .record(
          room.boardId,
          { type: "card.described", payload: { cardId: card.id, cardTitle: card.title, preview } },
          editor,
        )
        .catch((error: unknown) =>
          this.log.warn({ err: error, boardId: room.boardId }, "recording an edit session failed"),
        );
    }
  }
}

interface AwarenessChange {
  added: number[];
  updated: number[];
  removed: number[];
}
