import { describe, expect, it } from "vitest";
import { id, uuidv7 } from "../src";

describe("uuidv7", () => {
  it("is a valid version 7 UUID", () => {
    const value = uuidv7();
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.safeParse(value).success).toBe(true);
  });

  it("sorts by creation time", () => {
    const earlier = uuidv7(1_700_000_000_000);
    const later = uuidv7(1_700_000_000_001);
    expect(earlier < later).toBe(true);
  });

  it("does not repeat", () => {
    const many = new Set(Array.from({ length: 1000 }, () => uuidv7(1_700_000_000_000)));
    expect(many.size).toBe(1000);
  });
});
