import { describe, expect, it } from "vitest";
import type { ClipBrief } from "./domain";
import { approveClip, editClip, unapproveClip } from "./clip-state";

const base: ClipBrief = {
  id: "clip-001", batchId: "batch-001", brandId: "clipflow", concept: "Idea", hook: "Hook", keyMessage: "Message",
  supportingPoint: null, proof: null, cta: "Start", format: "explainer", durationSeconds: 25, sceneCopy: ["Hook", "End"], postCopy: "Post", mediaOverrides: [], status: "needs_review",
  voiceover: { script: "", audioPath: null, wordTimings: [], generatedFor: null }, motionStyle: "kinetic",
  progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: "2026-09-24T10:00:00.000Z",
};

describe("clip review state", () => {
  it("requires review before approval and supports explicit removal", () => {
    expect(approveClip(base).status).toBe("approved");
    expect(unapproveClip(approveClip(base)).status).toBe("needs_review");
    expect(() => approveClip({ ...base, status: "rendering" })).toThrow("Cannot approve");
  });
  it("editing invalidates approval while preserving the previous output", () => {
    const approved = { ...approveClip(base), outputPath: "exports/previous.mp4", coverPath: "exports/previous.png" };
    const edited = editClip(approved, { concept: "Revised", hook: "Hook", keyMessage: "Message", supportingPoint: null, proof: null, cta: "Start", format: "explainer", durationSeconds: 25, sceneCopy: ["Hook", "End"], postCopy: "Post", motionStyle: "kinetic", voiceoverScript: "" });
    expect(edited.status).toBe("needs_review");
    expect(edited.outputPath).toBe("exports/previous.mp4");
    expect(() => editClip({ ...base, status: "rendering" }, { concept: "Revised", hook: "Hook", keyMessage: "Message", supportingPoint: null, proof: null, cta: "Start", format: "explainer", durationSeconds: 25, sceneCopy: ["Hook", "End"], postCopy: "Post", motionStyle: "kinetic", voiceoverScript: "" })).toThrow("cannot be edited");
  });
  it("invalidates generated voice and old output when the narration changes", () => {
    const narrated = { ...base, voiceover: { script: "old line", audioPath: "local-assets/voiceovers/clip.wav", generatedFor: "abc", wordTimings: [{ word: "old", start: 0, end: 0.4 }] }, outputPath: "exports/old.mp4", coverPath: "exports/old.png" };
    const edited = editClip(narrated, { concept: "Idea", hook: "Hook", keyMessage: "Message", supportingPoint: null, proof: null, cta: "Start", format: "explainer", durationSeconds: 25, sceneCopy: ["Hook", "End"], postCopy: "Post", motionStyle: "kinetic", voiceoverScript: "new line" });
    expect(edited.voiceover).toMatchObject({ script: "new line", audioPath: null, wordTimings: [], generatedFor: null });
    expect(edited.outputPath).toBeNull();
    expect(edited.coverPath).toBeNull();
  });
});
