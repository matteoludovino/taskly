/**
 * Binary WebSocket frames for collaborative descriptions (one Yjs document per card), multiplexed on
 * the board's socket next to the JSON messages:
 *
 *   [type: 1 byte][card id: 16 bytes][payload]
 *
 * SYNC and AWARENESS payloads are y-protocols messages; DENIED carries a reason in UTF-8.
 */
export const FRAME = {
  subscribe: 0,
  unsubscribe: 1,
  sync: 2,
  awareness: 3,
  /** The server won't (or no longer will) serve this document to this connection. */
  denied: 4,
} as const;
export type FrameType = (typeof FRAME)[keyof typeof FRAME];

export type DeniedReason = "not_found" | "too_large";

/** The longest description, in characters (the editor stops there; the server has a looser guard). */
export const DESCRIPTION_MAX_CHARS = 20_000;
export const DESCRIPTION_PREVIEW_CHARS = 140;

const HEADER = 17;

export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`not a UUID: ${uuid}`);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function encodeFrame(
  type: FrameType,
  docId: string,
  payload: Uint8Array = new Uint8Array(),
): Uint8Array {
  const frame = new Uint8Array(HEADER + payload.length);
  frame[0] = type;
  frame.set(uuidToBytes(docId), 1);
  frame.set(payload, HEADER);
  return frame;
}

export interface Frame {
  type: FrameType;
  docId: string;
  payload: Uint8Array;
}

/** Null for anything that isn't a well-formed frame. */
export function decodeFrame(data: Uint8Array): Frame | null {
  if (data.length < HEADER) return null;
  const type = data[0]!;
  if (!Object.values(FRAME).includes(type as FrameType)) return null;
  return {
    type: type as FrameType,
    docId: bytesToUuid(data.subarray(1, HEADER)),
    payload: data.subarray(HEADER),
  };
}

/** The preview shown on a card: the start of the text, whitespace collapsed. */
export function descriptionPreview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > DESCRIPTION_PREVIEW_CHARS ? `${flat.slice(0, DESCRIPTION_PREVIEW_CHARS - 1)}…` : flat;
}
