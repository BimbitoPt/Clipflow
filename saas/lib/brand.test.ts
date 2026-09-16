import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";

describe("brand", () => {
  it("freezes the Clipflow tokens", () => {
    expect(BRAND.bg).toBe("#080A0D");
    expect(BRAND.blue).toBe("#246BFD");
    expect(BRAND.lime).toBe("#CFFF47");
    expect(BRAND.tagline).toBe("idea in, video out.");
  });
});
