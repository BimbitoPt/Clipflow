import { describe, expect, it } from "vitest";
import { starterBrands } from "./seed-brands";
import { buildCompositionProps, compositionId, makeScenePlan } from "./scene-plan";
import { ClipBriefSchema } from "./domain";

const clip = ClipBriefSchema.parse({ id: "clip-001", batchId: "batch-001", brandId: "clipflow", concept: "Story", hook: "A short hook", keyMessage: "A useful message", supportingPoint: null, proof: "Approved evidence", cta: "Start here", format: "explainer", durationSeconds: 25, sceneCopy: ["A short hook", "One useful point", "Approved evidence", "Start here"], postCopy: "Post", mediaOverrides: [], status: "needs_review", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: "2026-09-24T10:00:00.000Z" });

describe("Remotion composition planning", () => {
  it("is deterministic, keeps all scenes and reaches exact 10 and 60 second durations", () => {
    const tenSecond = makeScenePlan({ ...clip, durationSeconds: 10 }, 30);
    const sixtySecond = makeScenePlan({ ...clip, durationSeconds: 60 }, 30);
    expect(tenSecond.totalFrames).toBe(300);
    expect(tenSecond.scenes.at(-1)!.startFrame + tenSecond.scenes.at(-1)!.durationInFrames).toBe(300);
    expect(sixtySecond.totalFrames).toBe(1800);
    expect(makeScenePlan(clip)).toEqual(makeScenePlan(clip));
  });
  it("applies the selected brand and resolves the correct template family", () => {
    const props = buildCompositionProps(clip, starterBrands[0]);
    expect(props.brand.palette.accent).toBe("#246BFD");
    expect(compositionId("explainer")).toBe("ClipExplainer");
    expect(compositionId("demo")).toBe("ClipProductDemo");
    expect(compositionId("proof")).toBe("ClipProofStory");
  });
  it("rejects empty and excessive scene plans", () => {
    expect(() => makeScenePlan({ sceneCopy: ["Only one"], durationSeconds: 25 })).toThrow("between 2 and 8");
    expect(() => makeScenePlan({ sceneCopy: Array(9).fill("Beat"), durationSeconds: 25 })).toThrow("between 2 and 8");
  });
});
