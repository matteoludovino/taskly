import { decodeFrame, encodeFrame, FRAME } from "@taskly/shared";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import type { DocHub, Peer } from "./hub.ts";

/**
 * A description client living inside the server (the simulated teammate's): it speaks the same frames
 * as a browser, straight to the hub, so its edits and cursor reach everyone exactly like a person's.
 */
export class LocalDocClient implements Peer {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  private synced = false;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly hub: DocHub,
    readonly boardId: string,
    readonly participantId: string,
    readonly cardId: string,
    user: { name: string; color: string },
  ) {
    this.awareness.setLocalStateField("user", user);
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== this) this.send(FRAME.sync, (e) => syncProtocol.writeUpdate(e, update));
    });
    this.awareness.on("update", ({ added, updated, removed }: Record<string, number[]>, origin: unknown) => {
      if (origin === this) return;
      const changed = [...added!, ...updated!, ...removed!];
      this.deliver(
        encodeFrame(
          FRAME.awareness,
          cardId,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
        ),
      );
    });
  }

  /** Subscribes and resolves once the server's copy has arrived (false if the hub said no). */
  async open(timeoutMs = 5000): Promise<boolean> {
    this.deliver(encodeFrame(FRAME.subscribe, this.cardId));
    this.send(FRAME.sync, (e) => syncProtocol.writeSyncStep1(e, this.doc));
    const deadline = Date.now() + timeoutMs;
    while (!this.synced && !this.denied && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    return this.synced;
  }

  denied = false;

  async close(): Promise<void> {
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], null);
    this.deliver(encodeFrame(FRAME.unsubscribe, this.cardId));
    await this.chain;
    this.awareness.destroy();
    this.doc.destroy();
  }

  /** Frames from the hub. */
  sendBinary(data: Uint8Array): void {
    const frame = decodeFrame(data);
    if (!frame || frame.docId !== this.cardId) return;
    if (frame.type === FRAME.denied) {
      this.denied = true;
      return;
    }
    if (frame.type === FRAME.awareness) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, frame.payload, this);
      return;
    }
    if (frame.type !== FRAME.sync) return;
    const reply = encoding.createEncoder();
    const kind = syncProtocol.readSyncMessage(decoding.createDecoder(frame.payload), reply, this.doc, this);
    if (kind === syncProtocol.messageYjsSyncStep2) this.synced = true;
    if (encoding.length(reply) > 0)
      this.deliver(encodeFrame(FRAME.sync, this.cardId, encoding.toUint8Array(reply)));
  }

  private send(type: (typeof FRAME)["sync"], write: (e: encoding.Encoder) => void) {
    const encoder = encoding.createEncoder();
    write(encoder);
    this.deliver(encodeFrame(type, this.cardId, encoding.toUint8Array(encoder)));
  }

  /** In order, one at a time, like a socket. */
  private deliver(data: Uint8Array) {
    const frame = decodeFrame(data);
    if (frame) this.chain = this.chain.then(() => this.hub.handle(this, frame)).catch(() => undefined);
  }
}
