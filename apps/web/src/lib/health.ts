import "./zod-setup";
import { healthResponse, isSupportedProtocol } from "@taskly/shared";

export type ServerState = "online" | "offline" | "outdated";

/** Pings the API (which also wakes a sleeping instance) and checks it speaks a protocol we understand. */
export async function checkServer(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<ServerState> {
  try {
    const response = await fetcher("/api/health", { cache: "no-store", signal });
    if (!response.ok) return "offline";
    const parsed = healthResponse.safeParse(await response.json());
    if (!parsed.success) return "offline";
    return isSupportedProtocol(parsed.data.protocolVersion) ? "online" : "outdated";
  } catch {
    return "offline";
  }
}
