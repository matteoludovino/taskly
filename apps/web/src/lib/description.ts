import { decodeFrame, encodeFrame, FRAME, type DeniedReason } from "@taskly/shared";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import type { LiveBoard } from "./live-board";

export type DescriptionStatus =
  /** Waiting for the server's copy: not editable yet (the client never seeds content). */
  | "loading"
  /** In sync, changes go out as they're typed. */
  | "synced"
  /** Connection lost after syncing: still editable, changes go out on reconnect. */
  | "offline"
  /** Opened without a connection: nothing to edit against yet. */
  | "unavailable"
  | { denied: DeniedReason };

const AWARENESS_BATCH_MS = 100;

/**
 * One card's description as a Yjs document, kept in sync over the board's live connection: it
 * subscribes on open and after every reconnect (the two-way sync then exchanges whatever either side
 * missed), sends local changes as they happen, and batches cursor updates.
 */
export class DescriptionDoc {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  private status: DescriptionStatus;
  private everSynced = false;
  private listeners = new Set<() => void>();
  private cleanup: (() => void)[] = [];
  private changedClients = new Set<number>();
  private awarenessTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly live: LiveBoard,
    readonly cardId: string,
    user: { name: string; color: string },
  ) {
    this.status = live.getSnapshot().connection === "live" ? "loading" : "unavailable";
    this.awareness.setLocalStateField("user", user);
    this.doc.on("update", this.onLocalUpdate);
    this.awareness.on("update", this.onAwareness);
    this.cleanup.push(
      live.onBinary((data) => this.receive(data)),
      live.onLive(() => this.subscribe()),
      live.subscribe(() => {
        const { connection } = live.getSnapshot();
        if (connection !== "live" && typeof this.status === "string" && this.status !== "unavailable") {
          this.setStatus(this.everSynced ? "offline" : "unavailable");
        }
      }),
    );
    this.subscribe();
  }

  // useSyncExternalStore plumbing.
  subscribeStatus = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getStatus = () => this.status;

  /** Whether the editor may change the document now. */
  static editable(status: DescriptionStatus): boolean {
    return status === "synced" || status === "offline";
  }

  destroy(): void {
    this.live.sendBinary(encodeFrame(FRAME.unsubscribe, this.cardId));
    clearTimeout(this.awarenessTimer);
    this.cleanup.forEach((stop) => stop());
    this.awareness.destroy();
    this.doc.destroy();
  }

  private setStatus(status: DescriptionStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener());
  }

  private subscribe() {
    if (typeof this.status === "object") return; // denied: stays closed
    if (!this.live.sendBinary(encodeFrame(FRAME.subscribe, this.cardId))) return;
    if (!this.everSynced) this.setStatus("loading");
    this.sendSync((e) => syncProtocol.writeSyncStep1(e, this.doc));
    // The server forgot our cursor with the old connection: send it again.
    this.sendAwareness([this.doc.clientID]);
  }

  private sendSync(write: (e: encoding.Encoder) => void) {
    const encoder = encoding.createEncoder();
    write(encoder);
    this.live.sendBinary(encodeFrame(FRAME.sync, this.cardId, encoding.toUint8Array(encoder)));
  }

  private sendAwareness(clients: number[]) {
    const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients);
    this.live.sendBinary(encodeFrame(FRAME.awareness, this.cardId, update));
  }

  private onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    // Offline, this simply doesn't go out; the next sync sends everything the server lacks.
    this.sendSync((e) => syncProtocol.writeUpdate(e, update));
  };

  private onAwareness = ({ added, updated, removed }: Record<string, number[]>, origin: unknown) => {
    if (origin === this) return;
    for (const id of [...added!, ...updated!, ...removed!]) this.changedClients.add(id);
    this.awarenessTimer ??= setTimeout(() => {
      this.awarenessTimer = undefined;
      const clients = [...this.changedClients];
      this.changedClients.clear();
      this.sendAwareness(clients);
    }, AWARENESS_BATCH_MS);
  };

  private receive(data: Uint8Array) {
    const frame = decodeFrame(data);
    if (!frame || frame.docId !== this.cardId) return;
    switch (frame.type) {
      case FRAME.denied:
        this.setStatus({ denied: new TextDecoder().decode(frame.payload) as DeniedReason });
        return;
      case FRAME.awareness:
        awarenessProtocol.applyAwarenessUpdate(this.awareness, frame.payload, this);
        return;
      case FRAME.sync: {
        const reply = encoding.createEncoder();
        const kind = syncProtocol.readSyncMessage(
          decoding.createDecoder(frame.payload),
          reply,
          this.doc,
          this,
        );
        if (encoding.length(reply) > 0) {
          this.live.sendBinary(encodeFrame(FRAME.sync, this.cardId, encoding.toUint8Array(reply)));
        }
        if (kind === syncProtocol.messageYjsSyncStep2) {
          this.everSynced = true;
          this.setStatus("synced");
        }
      }
    }
  }
}
