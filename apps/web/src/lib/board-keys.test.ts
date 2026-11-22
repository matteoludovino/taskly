import { describe, expect, it } from "vitest";
import { inviteLink, keyFromHash } from "./board-keys";

describe("invite links", () => {
  it("carry the key in the fragment, and read it back", () => {
    const link = inviteLink("https://taskly.app", "AbCdEfGhIj", "s3cr3t-_key");
    expect(link).toBe("https://taskly.app/b/AbCdEfGhIj#k=s3cr3t-_key");
    expect(keyFromHash(new URL(link).hash)).toBe("s3cr3t-_key");
  });

  it("have no key when the fragment is missing or unrelated", () => {
    expect(keyFromHash("")).toBeNull();
    expect(keyFromHash("#section")).toBeNull();
  });
});
