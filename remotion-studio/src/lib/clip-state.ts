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

export type ClipEdit = Pick<ClipBrief, "concept" | "hook" | "keyMessage" | "supportingPoint" | "proof" | "cta" | "format" | "durationSeconds" | "sceneCopy" | "postCopy" | "motionStyle"> & { voiceoverScript: string };

export function editClip(clip: ClipBrief, patch: ClipEdit): ClipBrief {
  if (["rendering"].includes(clip.status)) throw new Error("A rendering clip cannot be edited");
  const { voiceoverScript, ...fields } = patch;
  const voiceover = voiceoverScript === clip.voiceover.script
    ? clip.voiceover
    : { script: voiceoverScript, audioPath: null, wordTimings: [], generatedFor: null };
  return {
    ...clip, ...fields, voiceover,
    outputPath: voiceoverScript === clip.voiceover.script ? clip.outputPath : null,
    coverPath: voiceoverScript === clip.voiceover.script ? clip.coverPath : null,
    status: "needs_review", progress: 0, renderError: null, updatedAt: new Date().toISOString(),
  };
}
