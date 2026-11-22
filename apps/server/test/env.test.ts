import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.ts";

describe("loadEnv", () => {
  it("applies defaults and splits the allowed origins", () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://x", WEB_ORIGINS: "https://a.app, https://b.app" });
    expect(env.PORT).toBe(8030);
    expect(env.WEB_ORIGINS).toEqual(["https://a.app", "https://b.app"]);
  });

  it("names every missing setting", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});
