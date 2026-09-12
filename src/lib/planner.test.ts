import { describe, expect, it } from "vitest";
import { MSTUDIO_PROFILE } from "./profile";
import { loadPack } from "./packs";
import { buildScript } from "./script";
import { planFrames } from "./planner";

describe("planner", () => {
  it("emits 45*fps frames with monotonic t and covering cues", () => {
    const s = buildScript("ships in two weeks", MSTUDIO_PROFILE, loadPack("mstudio"));
    const frames = planFrames(s, 30);
    expect(frames.length).toBe(45 * 30);
    expect(frames[0]!.t).toBe(0);
    expect(frames[0]!.cue.kind).toBe("hook");
    expect(frames[frames.length - 1]!.cue.kind).toBe("cta");
    for (let i = 1; i < frames.length; i++) expect(frames[i]!.t).toBeGreaterThan(frames[i - 1]!.t);
  });

  it("resolves integer frame boundaries at 30fps", () => {
    const s = buildScript("ships in two weeks", MSTUDIO_PROFILE, loadPack("mstudio"));
    const frames = planFrames(s, 30);
    expect(frames[4 * 30]!.cue.kind).toBe("beat");
    expect(frames[40 * 30]!.cue.kind).toBe("cta");
  });

  it("supports 60fps with full coverage", () => {
    const s = buildScript("ships in two weeks", MSTUDIO_PROFILE, loadPack("mstudio"));
    const frames = planFrames(s, 60);
    expect(frames.length).toBe(2700);
    expect(frames[frames.length - 1]!.cue.kind).toBe("cta");
  });
});
