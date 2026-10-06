import { describe, expect, it } from "vitest";
import { resolveSceneMotionIntent, makeScenePlan } from "./scene-plan";
import { defaultCreativeTreatment } from "./creative-defaults";
import { MotionIntentSchema } from "./domain";

describe("adaptive Remotion direction", () => {
  const automatic = { motionIntent: "auto" as const, evidenceApproved: false };
  it("uses the video's subject across beats, including footage-led hooks", () => {
    const context = { fullText: "Porsche GT3 RS night drive" };
    expect(resolveSceneMotionIntent(automatic, "One car", 0, 4, context)).toBe("kinetic-type");
    expect(resolveSceneMotionIntent(automatic, "From every angle", 1, 4, context)).toBe("none");
    expect(resolveSceneMotionIntent(automatic, "The aero details", 2, 4, context)).toBe("focus");
  });
  it("preserves intentional overrides and rejects unapproved evidence reveals", () => {
    expect(resolveSceneMotionIntent({ ...automatic, motionIntent: "comparison" }, "An editorial choice", 1, 4)).toBe("comparison");
    expect(resolveSceneMotionIntent({ ...automatic, motionIntent: "evidence-reveal" }, "An unapproved image", 1, 4)).toBe("kinetic-type");
    expect(resolveSceneMotionIntent({ evidenceApproved: false }, "Existing treatment", 1, 4)).toBeUndefined();
    expect(MotionIntentSchema.parse("none")).toBe("none");
  });
  it("plans new treatments from real copy without injecting canned graphics", () => {
    const creative = defaultCreativeTreatment("clipflow", "explainer", 3);
    expect(creative.scenes.every((scene) => scene.motionIntent === "auto" && !scene.visual && !scene.motionGraphic)).toBe(true);
    const plan = makeScenePlan({ durationSeconds: 15, sceneCopy: ["A useful insight", "The export takes 20 seconds", "Start here"], creative });
    expect(plan.scenes[0].motionIntent).toBe("kinetic-type");
    expect(plan.scenes[1]).toMatchObject({ motionIntent: "metric", motionLabels: ["20 seconds"] });
    expect(plan.scenes[1].motionReason).toContain("stated value");
  });
});
