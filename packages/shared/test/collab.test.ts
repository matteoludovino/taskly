import { describe, expect, it } from "vitest";
import { decodeFrame, descriptionPreview, encodeFrame, FRAME, uuidv7 } from "../src";

describe("collab frames", () => {
  it("round-trip type, card id and payload", () => {
    const docId = uuidv7();
    const payload = new Uint8Array([1, 2, 3, 250]);
    const frame = decodeFrame(encodeFrame(FRAME.sync, docId, payload));
    expect(frame).toEqual({ type: FRAME.sync, docId, payload });
  });

  it("reject short frames and unknown types", () => {
    expect(decodeFrame(new Uint8Array(5))).toBeNull();
    const bad = encodeFrame(FRAME.sync, uuidv7());
    bad[0] = 99;
    expect(decodeFrame(bad)).toBeNull();
  });

  it("preview the start of a description, whitespace collapsed", () => {
    expect(descriptionPreview("  Linha um\n\nLinha   dois ")).toBe("Linha um Linha dois");
    const long = descriptionPreview("a".repeat(500));
    expect(long).toHaveLength(140);
    expect(long.endsWith("…")).toBe(true);
  });
});
