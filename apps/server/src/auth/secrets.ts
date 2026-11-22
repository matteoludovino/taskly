import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A public board id: 10 base-62 characters (~59 bits), short enough for a link. */
export function newBoardId(): string {
  return Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** 256 random bits, URL-safe. Used for board keys and participant tokens. */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Secrets are stored as SHA-256: they're random, so a slow hash adds nothing. */
export function hashSecret(secret: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash("sha256").update(secret).digest());
}

export function matchesHash(secret: string, hash: Uint8Array): boolean {
  const candidate = hashSecret(secret);
  return candidate.length === hash.length && timingSafeEqual(candidate, hash);
}
