import { describe, expect, it } from "vitest";
import { loadPack, PACK_IDS, packLabel } from "./packs";
import { buildScript } from "./script";
import { MSTUDIO_PROFILE } from "./profile";

describe("packs", () => {
  it("loads the mstudio pack with usable banks", () => {
    const p = loadPack("mstudio");
    expect(p.id).toBe("mstudio");
    expect(p.hooks.length).toBeGreaterThanOrEqual(5);
    expect(p.ctas.length).toBeGreaterThanOrEqual(2);
    expect(p.hashtags.length).toBeGreaterThanOrEqual(3);
    expect(p.themes[0]!.bg.length).toBe(2);
  });

  it("loads every registered pack with usable banks", () => {
    expect(PACK_IDS).toContain("mstudio");
    expect(PACK_IDS).toContain("clipflow");
    for (const id of PACK_IDS) {
      const p = loadPack(id);
      expect(p.id).toBe(id);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.hooks.length).toBeGreaterThanOrEqual(5);
      expect(p.ctas.length).toBeGreaterThanOrEqual(2);
      expect(p.hashtags.length).toBeGreaterThanOrEqual(3);
      expect(p.themes.length).toBeGreaterThanOrEqual(1);
      expect(packLabel(id)).toBe(p.label);
    }
  });

  it("builds a Clipflow-branded script with the clipflow pack", () => {
    const script = buildScript("Posting daily is the whole game.", MSTUDIO_PROFILE, loadPack("clipflow"));
    expect(script.cues.length).toBe(5);
    const copy = [script.hook, ...script.beats, script.cta].join(" ").toLowerCase();
    expect(copy).not.toContain("mstudio");
    expect(copy).toMatch(/clipflow|post|video/);
  });

  it("throws E_UNKNOWN_PACK for anything else", () => {
    expect(() => loadPack("nope")).toThrowError(/E_UNKNOWN_PACK/);
  });
});
