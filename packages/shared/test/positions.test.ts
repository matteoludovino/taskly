import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { keyBetween, resolvePlacement } from "../src";

const list = (...ids: string[]) => ids.map((id, i) => ({ id, position: `a${i}` }));

describe("resolvePlacement", () => {
  const siblings = list("x", "y", "z");

  it("goes right after afterId when it is still there", () => {
    expect(resolvePlacement(siblings, "x", "z")).toMatchObject({ prev: { id: "x" }, next: { id: "y" } });
  });

  it("falls back to beforeId when afterId is gone", () => {
    expect(resolvePlacement(siblings, "gone", "z")).toMatchObject({ prev: { id: "y" }, next: { id: "z" } });
  });

  it("goes to the start when dropped there", () => {
    expect(resolvePlacement(siblings, null, "gone")).toMatchObject({ prev: null, next: { id: "x" } });
  });

  it("goes to the end when both neighbours are gone or unknown", () => {
    expect(resolvePlacement(siblings, "gone", "also-gone")).toMatchObject({ prev: { id: "z" }, next: null });
    expect(resolvePlacement(siblings, undefined, undefined)).toMatchObject({ prev: { id: "z" }, next: null });
  });

  it("handles an empty list", () => {
    expect(resolvePlacement([], null, null)).toEqual({ prev: null, next: null });
  });
});

function compareBytes(a: string, b: string): number {
  const [x, y] = [new TextEncoder().encode(a), new TextEncoder().encode(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}

describe("keyBetween", () => {
  it("keeps keys unique and ordered under any sequence of inserts", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 1, maxLength: 200 }), (spots) => {
        const keys: string[] = [];
        for (const spot of spots) {
          const index = spot % (keys.length + 1);
          keys.splice(index, 0, keyBetween(keys[index - 1] ?? null, keys[index] ?? null));
        }
        // Insertion order is the intended order: sorting must not change it, and nothing repeats.
        expect([...keys].sort()).toEqual(keys);
        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });

  it('sorts the same way byte by byte (PostgreSQL COLLATE "C") as with JavaScript\'s <', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 2, maxLength: 100 }), (spots) => {
        const keys: string[] = [];
        for (const spot of spots) {
          const index = spot % (keys.length + 1);
          keys.splice(index, 0, keyBetween(keys[index - 1] ?? null, keys[index] ?? null));
        }
        const bytewise = [...keys].sort(compareBytes);
        expect(bytewise).toEqual([...keys].sort());
        expect(keys.every((key) => /^[\x21-\x7e]+$/.test(key))).toBe(true);
      }),
    );
  });
});
