import type { ClipBrief } from "./domain";

export function approveClip(clip: ClipBrief): ClipBrief {
  if (!["needs_review", "approved", "rendered", "failed"].includes(clip.status)) throw new Error(`Cannot approve a ${clip.status} clip`);
  if (clip.status === "approved") return clip;
  return { ...clip, status: "approved", progress: 0, renderError: null, updatedAt: new Date().toISOString() };
}

export function unapproveClip(clip: ClipBrief): ClipBrief {
  if (!["needs_review", "approved", "rendered"].includes(clip.status)) throw new Error(`Cannot unapprove a ${clip.status} clip`);
  return { ...clip, status: "needs_review", progress: 0, renderError: null, updatedAt: new Date().toISOString() };
}

export type ClipEdit = Pick<ClipBrief, "concept" | "hook" | "keyMessage" | "supportingPoint" | "proof" | "cta" | "format" | "durationSeconds" | "sceneCopy" | "postCopy" | "motionStyle"> & { voiceoverScript: string; voiceId: ClipBrief["voiceover"]["voiceId"] };

export function editClip(clip: ClipBrief, patch: ClipEdit): ClipBrief {
  if (["rendering"].includes(clip.status)) throw new Error("A rendering clip cannot be edited");
  const { voiceoverScript, voiceId, ...fields } = patch;
  const voiceChanged = voiceoverScript !== clip.voiceover.script || voiceId !== clip.voiceover.voiceId;
  const voiceover = !voiceChanged
    ? clip.voiceover
    : { script: voiceoverScript, voiceId, audioPath: null, wordTimings: [], generatedFor: null };
  return {
    ...clip, ...fields, voiceover,
    creative: voiceChanged && clip.creative ? { ...clip.creative, captionCues: [] } : clip.creative,
    outputPath: voiceChanged ? null : clip.outputPath,
    coverPath: voiceChanged ? null : clip.coverPath,
    status: "needs_review", progress: 0, renderError: null, updatedAt: new Date().toISOString(),
  };
}
