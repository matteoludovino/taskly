import { describe, expect, it } from "vitest";
import { initials } from "./avatar";

describe("initials", () => {
  it("take the first letters of the first and last words, letters only", () => {
    expect(initials("Ana Souza")).toBe("AS");
    expect(initials("Bia (simulada)")).toBe("BS");
    expect(initials("  bruno ")).toBe("B");
    expect(initials("Élio d'Ávila")).toBe("ÉD");
  });
});
