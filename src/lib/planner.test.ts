import { describe, expect, it } from "vitest";
import { MSTUDIO_PROFILE } from "./profile";
import { loadPack } from "./packs";
import { buildScript } from "./script";
import { planFrames, planWords, planWordsTimed } from "./planner";

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

  it("planWordsTimed follows measured word times on token-count match", () => {
    const s = buildScript("ships in two weeks", MSTUDIO_PROFILE, loadPack("mstudio"));
    const hookTokens = s.cues[0]!.text.split(/\s+/).filter(Boolean);
    const timed = s.cues.map((c, i) => {
      const tokens = c.text.split(/\s+/).filter(Boolean);
      if (i !== 0) return { span: [c.start, c.end] as [number, number], words: null };
      return {
        span: [c.start, c.end + 10] as [number, number],
        words: tokens.map((word, k) => ({ word, start: 100 + k, end: 100 + k + 0.9 })),
      };
    });
    const out = planWordsTimed(s, timed);
    const hookWords = out.filter((w) => w.cueKind === "hook");
    expect(hookWords.length).toBe(hookTokens.length);
    expect(hookWords[0]!.start).toBe(100);
    expect(hookWords[0]!.word).toBe(hookTokens[0]);
  });

  it("planWordsTimed falls back to span split on token-count mismatch", () => {
    const s = buildScript("ships in two weeks", MSTUDIO_PROFILE, loadPack("mstudio"));
    const timed = s.cues.map((c) => ({
      span: [c.start + 100, c.end + 100] as [number, number],
      words: [{ word: "x", start: 1, end: 2 }],
    }));
    const out = planWordsTimed(s, timed);
    expect(out[0]!.start).toBe(100);
  });

  it("planWordsTimed without timing equals planWords", () => {
    const s = buildScript("ships in two weeks", MSTUDIO_PROFILE, loadPack("mstudio"));
    expect(planWordsTimed(s, null)).toEqual(planWords(s));
  });

  it("renders a voice-driven grid when spans are valid", () => {
    const s = buildScript("ships in two weeks", MSTUDIO_PROFILE, loadPack("mstudio"));
    const spans = [
      { start: 0, end: 7.8 },
      { start: 8.2, end: 14.6 },
      { start: 15, end: 21.7 },
      { start: 21.7, end: 31.7 },
      { start: 32.1, end: 37.1 },
    ];
    const frames = planFrames(s, 30, spans);
    expect(frames.length).toBe(Math.round(37.1 * 30));
    expect(frames[0]!.cue.kind).toBe("hook");
    expect(frames[Math.round(8.2 * 30)]!.cue.kind).toBe("beat");
    expect(frames[frames.length - 1]!.cue.kind).toBe("cta");
  });

  it("falls back to the 45s grid on invalid spans", () => {
    const s = buildScript("ships in two weeks", MSTUDIO_PROFILE, loadPack("mstudio"));
    expect(planFrames(s, 30, null).length).toBe(45 * 30);
    expect(planFrames(s, 30, [{ start: 0, end: 1 }]).length).toBe(45 * 30);
    expect(
      planFrames(s, 30, [
        { start: 0, end: 4 },
        { start: 4, end: 3 },
        { start: 3, end: 5 },
        { start: 5, end: 6 },
        { start: 6, end: 7 },
      ]).length,
    ).toBe(45 * 30);
  });
});
