import "./zod-setup";
import type { ApiError } from "@taskly/shared";

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** JSON in, JSON out, through the web app's own /api (the server's cookie is first-party). */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiFailure(0, "network", "Sem conexão com o servidor.");
  }
  const body = (await response.json().catch(() => null)) as T | ApiError | null;
  if (!response.ok) {
    const error = (body as ApiError | null)?.error;
    throw new ApiFailure(
      response.status,
      error?.code ?? "unknown",
      error?.message ?? "Algo deu errado. Tente de novo.",
    );
  }
  return body as T;
}
