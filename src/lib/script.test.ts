import { describe, expect, it } from "vitest";
import { MSTUDIO_PROFILE } from "./profile";
import { loadPack } from "./packs";
import { buildScript } from "./script";

const pack = loadPack("mstudio");
const idea = "fixed-price websites that ship in two weeks";

describe("script", () => {
  it("fills hook, 3 beats, cta with the idea present", () => {
    const s = buildScript(idea, MSTUDIO_PROFILE, pack);
    expect(s.beats.length).toBe(3);
    for (const t of [s.hook, ...s.beats, s.cta]) expect(t).toMatch(/fixed-price/i);
  });

  it("cues cover 0-45s without gaps", () => {
    const { cues } = buildScript(idea, MSTUDIO_PROFILE, pack);
    expect(cues[0]!.start).toBe(0);
    expect(cues[cues.length - 1]!.end).toBe(45);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.start).toBe(cues[i - 1]!.end);
  });

  it("linkedin pack has 3 variants + hashtags", () => {
    const s = buildScript(idea, MSTUDIO_PROFILE, pack);
    expect(s.linkedin.variants.length).toBe(3);
    expect(s.linkedin.hashtags.length).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic", () => {
    const a = JSON.stringify(buildScript(idea, MSTUDIO_PROFILE, pack));
    const b = JSON.stringify(buildScript(idea, MSTUDIO_PROFILE, pack));
    expect(a).toBe(b);
  });
});
