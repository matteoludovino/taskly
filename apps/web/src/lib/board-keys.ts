/**
 * Board keys this browser knows, so whoever is on a board can copy its invite link again. Kept in
 * localStorage (never sent anywhere but the join request); losing it only hides the share button.
 */
const storageKey = (boardId: string) => `taskly:key:${boardId}`;

export function rememberKey(boardId: string, key: string): void {
  try {
    localStorage.setItem(storageKey(boardId), key);
  } catch {
    // Private mode or storage disabled: sharing just won't be offered.
  }
}

export function knownKey(boardId: string): string | null {
  try {
    return localStorage.getItem(storageKey(boardId));
  } catch {
    return null;
  }
}

/** The key in the link's #fragment (`#k=…`), which browsers never send to any server. */
export function keyFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, "")).get("k");
}

export function inviteLink(origin: string, boardId: string, key: string): string {
  return `${origin}/b/${boardId}#k=${key}`;
}
