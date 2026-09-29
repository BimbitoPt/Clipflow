import { describe, expect, it } from "vitest";
import { buildScript } from "./script";
import { loadPack } from "./packs";
import { MSTUDIO_PROFILE } from "./profile";
import { applyScriptOverrides, hasScriptOverrides } from "./script-draft";

describe("editable five-beat script", () => {
  const base = buildScript("clear website prices", MSTUDIO_PROFILE, loadPack("mstudio"));

  it("updates cues and post copy without mutating the generated script", () => {
    const updated = applyScriptOverrides(base, { 0: "A better opening.", 2: "Here is the proof." });
    expect(updated.hook).toBe("A better opening.");
    expect(updated.beats[1]).toBe("Here is the proof.");
    expect(updated.cues.map((cue) => cue.text)).toEqual([updated.hook, ...updated.beats, updated.cta]);
    expect(updated.linkedin.body).toContain("A better opening.");
    expect(updated.linkedin.body).toContain("Here is the proof.");
    expect(base.hook).not.toBe(updated.hook);
    expect(base.beats[1]).not.toBe(updated.beats[1]);
  });

  it("detects edits and rejects an empty beat", () => {
    expect(hasScriptOverrides({})).toBe(false);
    expect(hasScriptOverrides({ 4: "A clear CTA." })).toBe(true);
    expect(() => applyScriptOverrides(base, { 1: "   " })).toThrow(/empty/i);
  });
});
