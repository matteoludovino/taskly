import { z } from "zod";

/**
 * Version of the client-server protocol. The server accepts this version and the one before it, so a
 * deploy (server first, then web) never strands an open tab; anything older is told to reload.
 */
export const PROTOCOL_VERSION = 1;

export function isSupportedProtocol(version: number): boolean {
  return version === PROTOCOL_VERSION || version === PROTOCOL_VERSION - 1;
}

/** `GET /api/health`: answers without touching the database, so it doubles as a cheap wake-up call. */
export const healthResponse = z.object({
  status: z.literal("ok"),
  protocolVersion: z.number().int(),
});
export type HealthResponse = z.infer<typeof healthResponse>;
