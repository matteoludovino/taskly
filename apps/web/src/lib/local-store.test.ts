import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { emptyBoard, initialSync, uuidv7, type Envelope } from "@taskly/shared";
import {
  cleanUp,
  forgetBoard,
  loadBoard,
  loadDoc,
  localDb,
  restore,
  saveBoard,
  saveDoc,
} from "./local-store";

const me = { id: "ana", name: "Ana", color: "#2563eb" };
const op = (): Envelope => ({ clientOpId: uuidv7(), op: { type: "board.rename", title: "Novo" } });

describe("local store", () => {
  it("keeps a board's confirmed state and pending operations across a reload", async () => {
    const board = { ...emptyBoard("B1", "Quadro"), seq: 7 };
    const pending = [op(), op()];
    await saveBoard("B1", me, { ...initialSync(board), pending, settled: { [pending[1]!.clientOpId]: 8 } });
    const restored = await loadBoard("B1");
    expect(restored?.board?.confirmed).toEqual(board);
    expect(restored?.board?.me).toEqual(me);
    expect(restored?.pending).toEqual(pending);
    expect(restored?.board?.settled).toEqual({ [pending[1]!.clientOpId]: 8 });
  });

  it("keeps description documents, and forgets everything of a board at once", async () => {
    await saveBoard("B2", me, initialSync(emptyBoard("B2", "Outro")));
    await saveDoc("B2", "card-1", new Uint8Array([1, 2, 3]));
    expect(await loadDoc("B2", "card-1")).toEqual(new Uint8Array([1, 2, 3]));
    await forgetBoard("B2");
    expect(await loadBoard("B2")).toBeNull();
    expect(await loadDoc("B2", "card-1")).toBeNull();
  });

  it("cleans up what wasn't touched for 30 days", async () => {
    await saveBoard("B3", me, initialSync(emptyBoard("B3", "Velho")));
    await saveDoc("B3", "card-1", new Uint8Array([9]));
    await cleanUp(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(await loadBoard("B3")).toBeNull();
    expect(await loadDoc("B3", "card-1")).toBeNull();
  });
});

describe("restoring a saved record", () => {
  it("keeps valid operations and counts the ones that no longer fit", () => {
    const good = op();
    const restored = restore({
      schema: 1,
      me,
      confirmed: emptyBoard("B", "Q"),
      pending: [good, { clientOpId: "x", op: { type: "card.fly" } }],
      settled: {},
    });
    expect(restored?.pending).toEqual([good]);
    expect(restored?.dropped).toBe(1);
  });

  it("drops a board saved in another format but keeps its operations", () => {
    const good = op();
    const restored = restore({ schema: 0, me, confirmed: { old: true }, pending: [good] });
    expect(restored).toEqual({ board: null, pending: [good], dropped: 0 });
  });

  it("is null for nothing saved", async () => {
    expect(restore(undefined)).toBeNull();
    expect(await (await localDb())?.count("boards")).toBeGreaterThanOrEqual(0);
  });
});
