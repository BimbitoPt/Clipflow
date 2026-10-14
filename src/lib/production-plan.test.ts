import { describe, expect, it } from "vitest";
import { buildScript } from "./script";
import { loadPack } from "./packs";
import { MSTUDIO_PROFILE } from "./profile";
import { buildProductionPlan, estimatePlanCost, regenerateShot } from "./production-plan";

describe("production-plan", () => {
  it("derives 5 shot cards with durations matching the cue grid", () => {
    const pack = loadPack("clipflow");
    const script = buildScript("car detailing", MSTUDIO_PROFILE, pack);
    const plan = buildProductionPlan(script, pack, "af_heart");
    expect(plan.shots).toHaveLength(5);
    expect(plan.shots[0]!.durationSecs).toBe(4);
    expect(plan.totalSecs).toBe(45);
    expect(plan.shots.every((s) => s.imagePrompt.length > 20)).toBe(true);
    expect(plan.shots.every((s) => s.cameraDirection.length > 10)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const pack = loadPack("clipflow");
    const script = buildScript("car detailing", MSTUDIO_PROFILE, pack);
    const a = buildProductionPlan(script, pack, "af_heart");
    const b = buildProductionPlan(script, pack, "af_heart");
    expect(a).toEqual(b);
  });
});

describe("plan cost", () => {
  it("estimates cost from shots, voice seconds and pixels", () => {
    const pack = loadPack("clipflow");
    const script = buildScript("car detailing", MSTUDIO_PROFILE, pack);
    const plan = buildProductionPlan(script, pack, "af_heart");
    const cost = estimatePlanCost(plan, { voiceOn: true, width: 720, height: 1280, fps: 30 });
    expect(cost.breakdown.shots).toBe(5);
    expect(cost.breakdown.voiceSecs).toBe(45);
    expect(cost.units).toBeGreaterThan(0);
    const silent = estimatePlanCost(plan, { voiceOn: false, width: 720, height: 1280, fps: 30 });
    expect(silent.units).toBeLessThan(cost.units);
  });
});

describe("shot regeneration", () => {
  it("changes the card deterministically per seed without touching durations", () => {
    const pack = loadPack("clipflow");
    const script = buildScript("car detailing", MSTUDIO_PROFILE, pack);
    const plan = buildProductionPlan(script, pack, "af_heart");
    const regen = regenerateShot(plan, 0, 1);
    expect(regen.shots[0]).not.toEqual(plan.shots[0]);
    expect(regen.shots[0]!.durationSecs).toBe(plan.shots[0]!.durationSecs);
    expect(regenerateShot(plan, 0, 1)).toEqual(regen);
    expect(regen.shots.slice(1)).toEqual(plan.shots.slice(1));
  });
});
