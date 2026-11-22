import { generateKeyBetween } from "fractional-indexing";

/**
 * Order keys for columns and cards. Keys are plain ASCII, so JavaScript's `<` and PostgreSQL's
 * `COLLATE "C"` sort them the same way (a locale collation would not). Only the server's keys are
 * final: it computes them from the neighbours it has, so two people dropping into the same gap still
 * end up with distinct, ordered keys.
 */
export function keyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface Placed {
  id: string;
  position: string;
}

/**
 * Where an item lands among `siblings` (sorted, the item itself excluded), given the neighbours the client
 * saw when it dropped it. The first rule that applies wins:
 * 1. right after `afterId`, if it is still there;
 * 2. right before `beforeId`, if it is still there;
 * 3. at the start, if the client dropped it there (`afterId === null`);
 * 4. at the end.
 * Returns the neighbours it ends up between.
 */
export function resolvePlacement<T extends Placed>(
  siblings: readonly T[],
  afterId: string | null | undefined,
  beforeId: string | null | undefined,
): { prev: T | null; next: T | null } {
  const at = (index: number) => siblings[index] ?? null;
  if (afterId) {
    const index = siblings.findIndex((s) => s.id === afterId);
    if (index >= 0) return { prev: at(index), next: at(index + 1) };
  }
  if (beforeId) {
    const index = siblings.findIndex((s) => s.id === beforeId);
    if (index >= 0) return { prev: at(index - 1), next: at(index) };
  }
  if (afterId === null) return { prev: null, next: at(0) };
  return { prev: at(siblings.length - 1), next: null };
}
