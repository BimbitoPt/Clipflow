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
    const clipflowProps = buildCompositionProps(clip, starterBrands[0]);
    const mstudioProps = buildCompositionProps({ ...clip, brandId: "mstudio" }, starterBrands[1]);
    expect(clipflowProps.brand.palette.accent).toBe("#CFFF47");
    expect(clipflowProps.brand.palette.accentAlt).toBe("#CFFF47");
    expect(clipflowProps.brand.captionStyle.highlightColor).toBe("#CFFF47");
    expect(mstudioProps.brand.palette.accent).toBe("#246BFD");
    expect(mstudioProps.brand.palette.accentAlt).toBe("#246BFD");
    expect(mstudioProps.brand.captionStyle.highlightColor).toBe("#246BFD");
    expect(compositionId("explainer")).toBe("ClipExplainer");
    expect(compositionId("demo")).toBe("ClipProductDemo");
    expect(compositionId("proof")).toBe("ClipProofStory");
  });
  it("carries selected motion and generated word timings into the composition", () => {
    const animated = ClipBriefSchema.parse({ ...clip, motionStyle: "snap", voiceover: { script: "Move now", audioPath: "local-assets/voiceovers/clip.wav", generatedFor: "abc", wordTimings: [{ word: "Move", start: 0, end: 0.4 }, { word: "now", start: 0.4, end: 0.8 }] } });
    const props = buildCompositionProps(animated, starterBrands[0]);
    expect(props.clip.motionStyle).toBe("snap");
    expect(props.clip.voiceover.wordTimings).toHaveLength(2);
  });
  it("keeps scene-specific stills attached while allocating longer time to the price reveal", () => {
    const creative = ClipBriefSchema.parse({ ...clip, durationSeconds: 16, creative: {
      template: "mstudio-pricing", sceneSeconds: [2, 2, 8, 2],
      scenes: clip.sceneCopy.map((_, index) => ({ bg: { prompt: `Scene ${index + 1} without text`, imagePath: `scene-backgrounds/mstudio-pricing/scene-${index + 1}.png`, promptHash: "abcdef123456" } })),
      captionCues: [], musicPath: null, sfxPath: null,
    } });
    const props = buildCompositionProps(creative, starterBrands[1]);
    expect(props.scenes[2].durationInFrames).toBeGreaterThan(props.scenes[0].durationInFrames * 3);
    expect(props.scenes[2].bg?.imagePath).toBe("scene-backgrounds/mstudio-pricing/scene-3.png");
    expect(props.scenes.at(-1)!.startFrame + props.scenes.at(-1)!.durationInFrames).toBe(480);
  });
  it("carries the selected motion graphic into the scene plan", () => {
    const cinematic = ClipBriefSchema.parse({ ...clip, creative: {
      template: "cinematic-story", sceneSeconds: [3, 3, 5, 3],
      scenes: [{ motionGraphic: "filmstrip" }, {}, { visual: { kind: "steps", items: ["HOOK", "PAYOFF"] } }, { motionGraphic: "filmstrip" }],
      captionCues: [], musicPath: null, sfxPath: null,
    } });
    const scenes = makeScenePlan(cinematic).scenes;
    expect(scenes[0].motionGraphic).toBe("filmstrip");
    expect(scenes[2].visual?.items).toEqual(["HOOK", "PAYOFF"]);
    expect(scenes[2].motionGraphic).toBeUndefined();
  });
  it("rejects empty and excessive scene plans", () => {
    expect(() => makeScenePlan({ sceneCopy: ["Only one"], durationSeconds: 25 })).toThrow("between 2 and 8");
    expect(() => makeScenePlan({ sceneCopy: Array(9).fill("Beat"), durationSeconds: 25 })).toThrow("between 2 and 8");
  });
});
