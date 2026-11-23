import { decodeFrame, encodeFrame, FRAME } from "@taskly/shared";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { FIELD } from "../src/collab/text.ts";
import type { TestClient } from "./ws-client.ts";

/** A Yjs client for one card's description over a test connection, speaking the browser's frames. */
export class DocClient {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  synced = false;
  denied: string | null = null;

  constructor(
    private readonly client: TestClient,
    readonly cardId: string,
  ) {
    client.binaryListeners.add((data) => this.receive(data));
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      this.send(FRAME.sync, (e) => syncProtocol.writeUpdate(e, update));
    });
    this.awareness.on("update", ({ added, updated, removed }: Record<string, number[]>, origin: unknown) => {
      if (origin === this) return;
      const changed = [...added!, ...updated!, ...removed!];
      client.ws.send(
        encodeFrame(
          FRAME.awareness,
          cardId,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
        ),
      );
    });
  }

  subscribe(): void {
    this.client.ws.send(encodeFrame(FRAME.subscribe, this.cardId));
    this.send(FRAME.sync, (e) => syncProtocol.writeSyncStep1(e, this.doc));
  }

  /** Appends a paragraph with `text` (the shape the editor uses). */
  write(text: string): void {
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText(text)]);
    const fragment = this.doc.getXmlFragment(FIELD);
    fragment.insert(fragment.length, [paragraph]);
  }

  /** Types into the first paragraph at `index`. */
  type(index: number, text: string): void {
    const paragraph = this.doc.getXmlFragment(FIELD).get(0) as Y.XmlElement;
    (paragraph.get(0) as Y.XmlText).insert(index, text);
  }

  text(): string {
    return this.doc
      .getXmlFragment(FIELD)
      .toArray()
      .map((p) => ((p as Y.XmlElement).get(0) as Y.XmlText | undefined)?.toString() ?? "")
      .join("\n");
  }

  async until(check: () => boolean, ms = 5000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`timed out (text: ${JSON.stringify(this.text())})`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  private send(type: (typeof FRAME)["sync"], write: (e: encoding.Encoder) => void) {
    const encoder = encoding.createEncoder();
    write(encoder);
    this.client.ws.send(encodeFrame(type, this.cardId, encoding.toUint8Array(encoder)));
  }

  private receive(data: Uint8Array) {
    const frame = decodeFrame(data);
    if (!frame || frame.docId !== this.cardId) return;
    if (frame.type === FRAME.denied) {
      this.denied = new TextDecoder().decode(frame.payload);
      return;
    }
    if (frame.type === FRAME.awareness) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, frame.payload, this);
      return;
    }
    if (frame.type !== FRAME.sync) return;
    const decoder = decoding.createDecoder(frame.payload);
    const reply = encoding.createEncoder();
    const kind = syncProtocol.readSyncMessage(decoder, reply, this.doc, this);
    if (kind === syncProtocol.messageYjsSyncStep2) this.synced = true;
    if (encoding.length(reply) > 0)
      this.client.ws.send(encodeFrame(FRAME.sync, this.cardId, encoding.toUint8Array(reply)));
  }
}
