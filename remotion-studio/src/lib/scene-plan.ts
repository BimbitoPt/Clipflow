import type { BrandKit, ClipBrief, ClipFormat, ResolvedMotionIntent } from "./domain";
import { selectMotionDirection, type MotionContext } from "../../../shared/motion-direction";

type CreativeScene = NonNullable<ClipBrief["creative"]>["scenes"][number];
export type SceneSegment = { copy: string; durationInFrames: number; startFrame: number; index: number; bg?: CreativeScene["bg"]; visual?: CreativeScene["visual"]; motionGraphic?: CreativeScene["motionGraphic"]; screen?: CreativeScene["screen"]; motionIntent?: ResolvedMotionIntent; motionLabels?: string[]; motionReason?: string; evidenceApproved?: boolean };
export type CompositionProps = { clip: ClipBrief; brand: BrandKit; format: ClipFormat; scenes: SceneSegment[]; totalFrames: number; transitionFrames: number; coverMode?: boolean };

export function resolveSceneMotionIntent(scene: CreativeScene | undefined, copy: string, index: number, sceneCount: number, context?: Partial<MotionContext>): ResolvedMotionIntent | undefined {
  if (!scene || scene.motionIntent === undefined) return undefined;
  const automatic = (): ResolvedMotionIntent => selectMotionDirection({ ...context, copy,
    role: index === 0 ? "hook" : index === sceneCount - 1 ? "cta" : "beat",
    approvedProof: Boolean(scene.screen && scene.evidenceApproved),
    steps: scene.visual?.kind === "steps" ? scene.visual.items : undefined,
  }).intent;
  if (scene.motionIntent === "auto") return automatic();
  if (scene.motionIntent === "evidence-reveal" && !(scene.screen && scene.evidenceApproved)) return automatic();
  return scene.motionIntent;
}

export function makeScenePlan(clip: Pick<ClipBrief, "sceneCopy" | "durationSeconds"> & { creative?: ClipBrief["creative"] }, fps = 30) {
  if (!Number.isInteger(fps) || fps < 1) throw new Error("Frame rate must be a positive integer");
  const sceneCount = clip.sceneCopy.length;
  if (sceneCount < 2 || sceneCount > 8) throw new Error("A composition needs between 2 and 8 scenes");
  const totalFrames = clip.durationSeconds * fps;
  const transitionFrames = Math.min(18, Math.max(6, Math.floor(totalFrames / (sceneCount * 2))));
  const contentFrames = totalFrames + transitionFrames * (sceneCount - 1);
  const wordWeights = clip.sceneCopy.map((copy, index) => {
    const wordCount = copy.trim().split(/\s+/).filter(Boolean).length;
    const positionWeight = index === 0 || index === sceneCount - 1 ? 1.08 : 1;
    return Math.min(1.7, Math.max(0.65, Math.sqrt(Math.max(1, wordCount) / 6))) * positionWeight;
  });
  const weights = clip.creative?.sceneSeconds.length === sceneCount ? clip.creative.sceneSeconds : wordWeights;
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const exactFrames = weights.map((weight) => (weight / weightTotal) * contentFrames);
  const durations = exactFrames.map(Math.floor);
  let remainder = contentFrames - durations.reduce((sum, duration) => sum + duration, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % durations.length) { durations[i]++; remainder--; }
  let startFrame = 0;
  const scenes = clip.sceneCopy.map((copy, index) => {
    const creativeScene = clip.creative?.scenes[index];
    const context: MotionContext = { copy, fullText: clip.sceneCopy.join(" "),
      role: index === 0 ? "hook" : index === sceneCount - 1 ? "cta" : "beat",
      medium: creativeScene?.bg ? "image" : undefined,
      approvedProof: Boolean(creativeScene?.screen && creativeScene.evidenceApproved),
      steps: creativeScene?.visual?.kind === "steps" ? creativeScene.visual.items : undefined,
    };
    const direction = selectMotionDirection(context);
    const scene: SceneSegment = { copy, durationInFrames: durations[index], startFrame, index, bg: creativeScene?.bg, visual: creativeScene?.visual, motionGraphic: creativeScene?.motionGraphic, screen: creativeScene?.screen, motionIntent: resolveSceneMotionIntent(creativeScene, copy, index, sceneCount, context), motionLabels: direction.labels, motionReason: creativeScene?.motionIntent === "auto" ? direction.reason : undefined, evidenceApproved: creativeScene?.evidenceApproved ?? false };
    startFrame += durations[index] - (index < sceneCount - 1 ? transitionFrames : 0);
    return scene;
  });
  return { scenes, totalFrames, transitionFrames };
}

export function buildCompositionProps(clip: ClipBrief, brand: BrandKit, fps = 30): CompositionProps {
  const plan = makeScenePlan(clip, fps);
  return { clip, brand, format: clip.format, ...plan };
}

export function compositionId(format: ClipFormat): string {
  return { explainer: "ClipExplainer", demo: "ClipProductDemo", proof: "ClipProofStory" }[format];
}
