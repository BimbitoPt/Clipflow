import { describe, expect, it } from "vitest";
import { buildScript } from "./script";
import { loadPack } from "./packs";
import { MSTUDIO_PROFILE } from "./profile";
import { buildProductionPlan, estimatePlanCost, findUnapprovedShot, applyShotEdits, editShot, normalizeShotValue, regenerateShot, setShotEdit, validateShotField, validPlanEdits } from "./production-plan";

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

describe("director gate", () => {
  it("passes only when all 5 shots are approved", () => {
    expect(findUnapprovedShot([true, true, true, true, true])).toBe(-1);
  });

  it("reports the first unapproved shot index", () => {
    expect(findUnapprovedShot([true, true, false, true, true])).toBe(2);
    expect(findUnapprovedShot([false, true, true, true, true])).toBe(0);
  });

  it("blocks short, long, and non-array payloads", () => {
    expect(findUnapprovedShot([])).not.toBe(-1);
    expect(findUnapprovedShot([true, true, true, true])).not.toBe(-1);
    expect(findUnapprovedShot([true, true, true, true, true, true])).not.toBe(-1);
    expect(findUnapprovedShot(undefined)).not.toBe(-1);
    expect(findUnapprovedShot(null)).not.toBe(-1);
    expect(findUnapprovedShot("approved")).not.toBe(-1);
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

describe("editable shot fields", () => {
  const base = () => {
    const pack = loadPack("clipflow");
    const script = buildScript("car detailing", MSTUDIO_PROFILE, pack);
    return buildProductionPlan(script, pack, "af_heart");
  };

  it("validates prompt text: non-empty and within budget", () => {
    expect(validateShotField("imagePrompt", "  cinematic close-up  ")).toBeNull();
    expect(validateShotField("imagePrompt", "   ")).toMatch(/empty/);
    expect(validateShotField("imagePrompt", "x".repeat(501))).toMatch(/500/);
    expect(validateShotField("cameraDirection", "slow push in")).toBeNull();
    expect(validateShotField("cameraDirection", "")).toMatch(/empty/);
    expect(validateShotField("cameraDirection", "y".repeat(201))).toMatch(/200/);
  });

  it("validates durations: numeric, finite, within range; rejects empty", () => {
    expect(validateShotField("durationSecs", 4)).toBeNull();
    expect(validateShotField("durationSecs", "4.5")).toBeNull();
    expect(validateShotField("durationSecs", "")).toMatch(/Enter a duration/);
    expect(validateShotField("durationSecs", "abc")).toMatch(/number/);
    expect(validateShotField("durationSecs", Number.NaN)).toMatch(/number/);
    expect(validateShotField("durationSecs", 0)).toMatch(/at least/);
    expect(validateShotField("durationSecs", -3)).toMatch(/at least/);
    expect(validateShotField("durationSecs", 61)).toMatch(/at most/);
  });

  it("normalizes values (trimmed text, 0.1s-rounded duration)", () => {
    expect(normalizeShotValue("imagePrompt", "  hi  ")).toBe("hi");
    expect(normalizeShotValue("cameraDirection", " pan ")).toBe("pan");
    expect(normalizeShotValue("durationSecs", 4.26)).toBe(4.3);
    expect(normalizeShotValue("durationSecs", "4")).toBe(4);
  });

  it("applyShotEdits returns the same plan with no edits (identity)", () => {
    const plan = base();
    expect(applyShotEdits(plan, {})).toBe(plan);
  });

  it("applyShotEdits overlays prompt and camera without touching durations", () => {
    const plan = base();
    const edited = applyShotEdits(plan, { 0: { imagePrompt: "custom hook art", cameraDirection: "whip pan" } });
    expect(edited.shots[0]!.imagePrompt).toBe("custom hook art");
    expect(edited.shots[0]!.cameraDirection).toBe("whip pan");
    expect(edited.shots[0]!.durationSecs).toBe(plan.shots[0]!.durationSecs);
    expect(edited.totalSecs).toBe(plan.totalSecs);
    expect(edited.shots.slice(1)).toEqual(plan.shots.slice(1));
  });

  it("applyShotEdits re-sums totalSecs when a duration is edited", () => {
    const plan = base();
    const edited = applyShotEdits(plan, { 0: { durationSecs: 7.5 } });
    expect(edited.shots[0]!.durationSecs).toBe(7.5);
    expect(edited.totalSecs).toBe(Math.round((plan.totalSecs - plan.shots[0]!.durationSecs + 7.5) * 10) / 10);
    const cost = estimatePlanCost(edited, { voiceOn: true, width: 720, height: 1280, fps: 30 });
    expect(cost.renderSecs).toBe(edited.totalSecs);
  });

  it("setShotEdit sets, reverts to derived, and drops empty entries", () => {
    const plan = base();
    const derived = plan.shots[0]!.imagePrompt;
    const set = setShotEdit({}, 0, "imagePrompt", "  custom  ", derived);
    expect(set).toEqual({ 0: { imagePrompt: "custom" } });
    // Setting back to the derived value removes the override entirely.
    expect(setShotEdit(set, 0, "imagePrompt", derived, derived)).toEqual({});
    // Adds a sibling field without dropping the first.
    const withDuration = setShotEdit(set, 0, "durationSecs", 6, plan.shots[0]!.durationSecs);
    expect(withDuration).toEqual({ 0: { imagePrompt: "custom", durationSecs: 6 } });
    // Reverting one of two only removes that field.
    expect(setShotEdit(withDuration, 0, "imagePrompt", derived, derived)).toEqual({ 0: { durationSecs: 6 } });
  });

  it("setShotEdit returns the same map for a no-op", () => {
    const plan = base();
    const edits = { 0: { imagePrompt: "custom" } };
    expect(setShotEdit(edits, 0, "imagePrompt", "custom", plan.shots[0]!.imagePrompt)).toBe(edits);
    expect(setShotEdit({}, 1, "cameraDirection", plan.shots[1]!.cameraDirection, plan.shots[1]!.cameraDirection)).toEqual({});
  });

  it("validPlanEdits keeps well-formed fields and drops the rest", () => {
    const good = {
      0: { imagePrompt: " hook art ", durationSecs: 4.26 },
      3: { cameraDirection: "slow push" },
    };
    expect(validPlanEdits(good)).toEqual({
      0: { imagePrompt: "hook art", durationSecs: 4.3 },
      3: { cameraDirection: "slow push" },
    });
    // Per-field degrade: a bad duration doesn't discard a valid prompt.
    expect(validPlanEdits({ 2: { imagePrompt: "keep", durationSecs: 999 } })).toEqual({ 2: { imagePrompt: "keep" } });
    // Bad keys/entries/non-finite durations are dropped.
    expect(validPlanEdits({ 9: { imagePrompt: "x" } })).toEqual({});
    expect(validPlanEdits({ 0: "nope" })).toEqual({});
    expect(validPlanEdits({ 0: { durationSecs: Number.POSITIVE_INFINITY } })).toEqual({});
    expect(validPlanEdits({ 0: { imagePrompt: "" } })).toEqual({});
    for (const bad of [null, undefined, 42, "x", [1, 2]]) expect(validPlanEdits(bad)).toEqual({});
  });
});

describe("editShot approval reset", () => {
  const plan = () => {
    const pack = loadPack("clipflow");
    const script = buildScript("car detailing", MSTUDIO_PROFILE, pack);
    return buildProductionPlan(script, pack, "af_heart");
  };

  it("unapproves only the edited shot", () => {
    const p = plan();
    const approved = [true, true, false, true, true];
    const next = editShot({}, approved, 1, "imagePrompt", "custom", p.shots[1]!.imagePrompt);
    expect(next.edits).toEqual({ 1: { imagePrompt: "custom" } });
    expect(next.approvedShots).toEqual([true, false, false, true, true]);
  });

  it("leaves edits and approvals untouched for a no-op edit", () => {
    const p = plan();
    const edits = {};
    const approved = [true, true, false, true, true];
    const next = editShot(edits, approved, 2, "cameraDirection", p.shots[2]!.cameraDirection, p.shots[2]!.cameraDirection);
    expect(next.edits).toBe(edits);
    expect(next.approvedShots).toBe(approved);
  });

  it("unapproves when an override is cleared back to its derived value", () => {
    const p = plan();
    const edits = { 3: { durationSecs: 9 } };
    const approved = [true, true, true, true, true];
    const next = editShot(edits, approved, 3, "durationSecs", p.shots[3]!.durationSecs, p.shots[3]!.durationSecs);
    expect(next.edits).toEqual({});
    expect(next.approvedShots[3]).toBe(false);
    expect(next.approvedShots.slice(0, 3)).toEqual([true, true, true]);
  });
});
