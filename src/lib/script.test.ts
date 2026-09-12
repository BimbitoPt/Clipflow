import { describe, expect, it } from "vitest";
import { MSTUDIO_PROFILE } from "./profile";
import { loadPack } from "./packs";
import { buildScript } from "./script";

const pack = loadPack("mstudio");
const idea = "fixed-price websites that ship in two weeks";

describe("script", () => {
  it("names the idea once: hook contains it verbatim, beats/cta do not", () => {
    const s = buildScript(idea, MSTUDIO_PROFILE, pack);
    expect(s.beats.length).toBe(3);
    expect(s.hook).toContain(idea);
    for (const t of [...s.beats, s.cta]) expect(t).not.toContain(idea);
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

  it("empty idea throws E_EMPTY_IDEA", () => {
    expect(() => buildScript("   ", MSTUDIO_PROFILE, pack)).toThrow("E_EMPTY_IDEA");
  });

  it("empty hooks bank throws E_EMPTY_BANK", () => {
    const emptyHooks = { ...loadPack("mstudio"), hooks: [] };
    expect(() => buildScript(idea, MSTUDIO_PROFILE, emptyHooks)).toThrow("E_EMPTY_BANK");
  });

  it("long idea is bounded but keeps the start", () => {
    const longIdea = "fixed-price ".repeat(26);
    expect(longIdea.length).toBeGreaterThan(300);
    const s = buildScript(longIdea, MSTUDIO_PROFILE, pack);
    expect(s.hook.length).toBeLessThan(220);
    expect(s.hook).toContain(longIdea.slice(0, 30));
  });

  it("body contains hashtags", () => {
    const s = buildScript(idea, MSTUDIO_PROFILE, pack);
    expect(s.linkedin.body).toContain("#webdesign");
  });
});
