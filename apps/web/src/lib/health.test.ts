import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "@taskly/shared";
import { checkServer } from "./health";

const respond =
  (status: number, body: unknown): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body), { status });

describe("checkServer", () => {
  it("is online when the server speaks our protocol", async () => {
    expect(await checkServer(respond(200, { status: "ok", protocolVersion: PROTOCOL_VERSION }))).toBe(
      "online",
    );
  });

  it("asks for a reload when the server moved on", async () => {
    expect(await checkServer(respond(200, { status: "ok", protocolVersion: PROTOCOL_VERSION + 2 }))).toBe(
      "outdated",
    );
  });

  it("is offline on errors, odd answers and network failures", async () => {
    expect(await checkServer(respond(502, {}))).toBe("offline");
    expect(await checkServer(respond(200, { hello: "world" }))).toBe("offline");
    expect(
      await checkServer(async () => {
        throw new TypeError("fetch failed");
      }),
    ).toBe("offline");
  });
});
