import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, healthResponse, isSupportedProtocol } from "../src";

describe("protocol version", () => {
  it("accepts the current version and the previous one", () => {
    expect(isSupportedProtocol(PROTOCOL_VERSION)).toBe(true);
    expect(isSupportedProtocol(PROTOCOL_VERSION - 1)).toBe(true);
  });

  it("rejects anything older or newer", () => {
    expect(isSupportedProtocol(PROTOCOL_VERSION - 2)).toBe(false);
    expect(isSupportedProtocol(PROTOCOL_VERSION + 1)).toBe(false);
  });
});

describe("health response", () => {
  it("parses what the server sends", () => {
    expect(healthResponse.parse({ status: "ok", protocolVersion: 1 })).toEqual({
      status: "ok",
      protocolVersion: 1,
    });
  });

  it("rejects anything else", () => {
    expect(healthResponse.safeParse({ status: "down", protocolVersion: 1 }).success).toBe(false);
  });
});
