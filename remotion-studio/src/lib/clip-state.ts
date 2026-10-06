import type { ClipBrief, MotionIntent } from "./domain";

export function approveClip(clip: ClipBrief): ClipBrief {
  if (!["needs_review", "approved", "rendered", "failed"].includes(clip.status)) throw new Error(`Cannot approve a ${clip.status} clip`);
  if (clip.status === "approved") return clip;
  return { ...clip, status: "approved", progress: 0, renderError: null, updatedAt: new Date().toISOString() };
}

export function unapproveClip(clip: ClipBrief): ClipBrief {
  if (!["needs_review", "approved", "rendered"].includes(clip.status)) throw new Error(`Cannot unapprove a ${clip.status} clip`);
  return { ...clip, status: "needs_review", progress: 0, renderError: null, updatedAt: new Date().toISOString() };
}

export type ClipEdit = Pick<ClipBrief, "concept" | "hook" | "keyMessage" | "supportingPoint" | "proof" | "cta" | "format" | "durationSeconds" | "sceneCopy" | "postCopy" | "motionStyle"> & { visualEffect?: ClipBrief["visualEffect"]; voiceoverScript: string; voiceId: ClipBrief["voiceover"]["voiceId"]; sceneMotionIntents?: Array<MotionIntent | null>; sceneEvidenceApprovals?: boolean[] };

export function editClip(clip: ClipBrief, patch: ClipEdit): ClipBrief {
  if (["rendering"].includes(clip.status)) throw new Error("A rendering clip cannot be edited");
  const { voiceoverScript, voiceId, visualEffect, sceneMotionIntents, sceneEvidenceApprovals, ...fields } = patch;
  const voiceChanged = voiceoverScript !== clip.voiceover.script || voiceId !== clip.voiceover.voiceId;
  const visualChanged = (visualEffect ?? clip.visualEffect) !== clip.visualEffect || Boolean(clip.creative && (
    sceneMotionIntents?.some((intent, index) => intent !== (clip.creative!.scenes[index]?.motionIntent ?? null)) ||
    sceneEvidenceApprovals?.some((approved, index) => approved !== (clip.creative!.scenes[index]?.evidenceApproved ?? false))
  ));
  const voiceover = !voiceChanged
    ? clip.voiceover
    : { script: voiceoverScript, voiceId, audioPath: null, wordTimings: [], generatedFor: null };
  const creative = clip.creative && sceneMotionIntents?.length === clip.creative.scenes.length && sceneEvidenceApprovals?.length === clip.creative.scenes.length
    ? { ...clip.creative, scenes: clip.creative.scenes.map((scene, index) => ({ ...scene, motionIntent: sceneMotionIntents[index] ?? undefined, evidenceApproved: sceneEvidenceApprovals[index] })) }
    : clip.creative;
  return {
    ...clip, ...fields, visualEffect: visualEffect ?? clip.visualEffect, voiceover,
    creative: voiceChanged && creative ? { ...creative, captionCues: [] } : creative,
    outputPath: voiceChanged || visualChanged ? null : clip.outputPath,
    coverPath: voiceChanged || visualChanged ? null : clip.coverPath,
    status: "needs_review", progress: 0, renderError: null, updatedAt: new Date().toISOString(),
  };
}
