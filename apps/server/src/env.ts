import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8030),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  /** Exact origins allowed to open the WebSocket and call the API (comma-separated). */
  WEB_ORIGINS: z
    .string()
    .default("http://localhost:3020")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /** The WebSocket address browsers connect to (wss://… in production). */
  PUBLIC_WS_URL: z.string().default("ws://localhost:8030/ws"),
  DEMO_MAX_BOARDS: z.coerce.number().int().positive().default(300),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment:\n  ${problems.join("\n  ")}`);
  }
  return parsed.data;
}
