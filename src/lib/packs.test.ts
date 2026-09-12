import { describe, expect, it } from "vitest";
import { loadPack } from "./packs";

describe("packs", () => {
  it("loads the mstudio pack with usable banks", () => {
    const p = loadPack("mstudio");
    expect(p.id).toBe("mstudio");
    expect(p.hooks.length).toBeGreaterThanOrEqual(5);
    expect(p.ctas.length).toBeGreaterThanOrEqual(2);
    expect(p.hashtags.length).toBeGreaterThanOrEqual(3);
    expect(p.themes[0]!.bg.length).toBe(2);
  });

  it("throws E_UNKNOWN_PACK for anything else", () => {
    expect(() => loadPack("nope")).toThrowError(/E_UNKNOWN_PACK/);
  });
});
