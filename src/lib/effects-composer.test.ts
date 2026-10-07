import { beforeEach, describe, expect, it } from "vitest";
import { composeTimeline, mulberry32, previewPlan } from "../../shared/effects/composer";
import { clearRegistry, registerEffect } from "../../shared/effects/registry";
import type { BuildParams, EffectDef, FxCtx } from "../../shared/effects/types";

const CTX: FxCtx = { W: 720, H: 1280, fps: 30, duration: 30, accent: "#CFFF47", bg: "#080A0D", ink: "#F7F8FA", fontFile: "/f.ttf" };

function stub(id: string, category: EffectDef["category"], heavy = false): EffectDef {
  return {
    id,
    name: id,
    category,
    niches: ["universal"],
    intensities: ["subtle", "medium", "hype"],
    heavy,
    scope: "chain",
    describe: id,
    build: (p: BuildParams) => ({ filters: [`null /*${id} ${p.start.toFixed(2)}*/`] }),
  };
}

const PROFILE = {
  id: "t",
  label: "T",
  keywords: [],
  pack: {
    effects: [
      { id: "cam", weight: 3 },
      { id: "txt", weight: 2 },
      { id: "fx-heavy", weight: 3 },
    ],
    grade: "grd",
    transition: "trn",
    captionStyle: "pop",
    pacing: 10,
  },
};

beforeEach(() => {
  clearRegistry();
  registerEffect(stub("cam", "camera"));
  registerEffect(stub("txt", "text"));
  registerEffect(stub("grd", "color"));
  registerEffect(stub("trn", "transition", true));
  registerEffect(stub("fx-heavy", "overlay", true));
});

const CUES = { cuts: [5], beats: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], keywords: [{ t: 6, word: "wow" }] };

describe("composeTimeline", () => {
  it("returns an empty graph when off", () => {
    const r = composeTimeline({ profile: PROFILE, duration: 30, level: "off", seed: 1, ctx: CTX, cues: CUES });
    expect(r.placed).toEqual([]);
    expect(r.graph.script()).toBe("");
  });

  it("is deterministic for the same seed", () => {
    const base = { profile: PROFILE, duration: 30, level: "hype" as const, seed: 42, ctx: CTX, cues: CUES };
    const a = composeTimeline(base);
    const b = composeTimeline(base);
    expect(a.placed).toEqual(b.placed);
    expect(a.graph.script()).toBe(b.graph.script());
  });

  it("varies placement across seeds", () => {
    const base = { profile: PROFILE, duration: 30, level: "hype" as const, ctx: CTX, cues: CUES };
    const a = composeTimeline({ ...base, seed: 1 });
    const b = composeTimeline({ ...base, seed: 999 });
    expect(a.placed).not.toEqual(b.placed);
  });

  it("enforces the per-10s budget and min gap", () => {
    const r = composeTimeline({ profile: PROFILE, duration: 30, level: "subtle", seed: 7, ctx: CTX, cues: CUES });
    for (const p of r.placed) {
      const n = r.placed.filter((q) => q.start >= p.start - 10 && q.start <= p.start).length;
      expect(n).toBeLessThanOrEqual(2);
    }
    for (let i = 1; i < r.placed.length; i++) {
      expect(r.placed[i].start - r.placed[i - 1].start).toBeGreaterThanOrEqual(1.2 - 1e-9);
    }
  });

  it("never stacks heavy effects", () => {
    const r = composeTimeline({
      profile: PROFILE,
      duration: 30,
      level: "hype",
      seed: 3,
      ctx: CTX,
      cues: { cuts: [5, 5.2, 5.4], beats: [], keywords: [] },
    });
    const heavy = r.placed.filter((p) => p.defId === "trn");
    expect(heavy.length).toBeLessThanOrEqual(1);
  });

  it("honors the disabled list and records skips", () => {
    const r = composeTimeline({
      profile: PROFILE,
      duration: 30,
      level: "hype",
      seed: 3,
      ctx: CTX,
      cues: CUES,
      disabled: ["cam", "txt", "trn", "fx-heavy"],
    });
    expect(r.placed).toEqual([]);
    expect(r.skipped.some((s) => s.reason === "disabled")).toBe(true);
  });

  it("skips effects whose filters are unavailable", () => {
    clearRegistry();
    registerEffect({
      ...stub("needs-x", "overlay"),
      build: () => ({ filters: ["rgbashift=rh=4:enable='between(t,1,2)'"], requires: ["rgbashift"] }),
    });
    const prof = { ...PROFILE, pack: { ...PROFILE.pack, effects: [{ id: "needs-x", weight: 1 }], grade: undefined } };
    const r = composeTimeline({
      profile: prof,
      duration: 10,
      level: "hype",
      seed: 1,
      ctx: CTX,
      cues: { cuts: [], beats: [2], keywords: [] },
      unavailable: new Set(["rgbashift"]),
    });
    expect(r.placed).toEqual([]);
    expect(r.skipped.some((s) => s.reason === "missing-filter:rgbashift")).toBe(true);
  });

  it("emits ASS content when cues are given", () => {
    const r = composeTimeline({
      profile: PROFILE,
      duration: 10,
      level: "subtle",
      seed: 1,
      ctx: CTX,
      cues: { cuts: [], beats: [], keywords: [] },
      assCues: [{ text: "Hello world test", start: 1, end: 3 }],
    });
    expect(r.ass).toContain("[V4+ Styles]");
    expect(r.ass).toContain("Dialogue:");
  });

  it("produces a valid graph", () => {
    const r = composeTimeline({ profile: PROFILE, duration: 30, level: "medium", seed: 5, ctx: CTX, cues: CUES });
    expect(r.graph.validate(1)).toEqual([]);
  });
});

describe("mulberry32", () => {
  it("is stable per seed", () => {
    expect(mulberry32(9)()).toBe(mulberry32(9)());
    expect(mulberry32(9)()).not.toBe(mulberry32(10)());
  });
});

describe("previewPlan", () => {
  it("downscales and clamps the span to 5-10s", () => {
    expect(previewPlan(45, 720, 1280)).toEqual({ scale: "scale=360:640", seconds: 10 });
    expect(previewPlan(7, 720, 1280).seconds).toBe(7);
    expect(previewPlan(3, 720, 1280).seconds).toBe(5);
  });
});
