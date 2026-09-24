import { describe, expect, it } from "vitest";
import { renderArtifactPaths, slug } from "./render-artifacts";
import { starterBrands } from "./seed-brands";
import { ClipBriefSchema, BatchSchema } from "./domain";

const clip = ClipBriefSchema.parse({ id: "clip-001", batchId: "batch-001", brandId: "clipflow", concept: "First announcement", hook: "A hook", keyMessage: "Message", supportingPoint: null, proof: null, cta: "Go", format: "explainer", durationSeconds: 25, sceneCopy: ["A", "B"], postCopy: "Post", mediaOverrides: [], status: "approved", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: "2026-09-24T10:00:00.000Z" });
const batch = BatchSchema.parse({ id: "batch-001", name: "Batch", createdAt: "2026-09-24T10:00:00.000Z", updatedAt: "2026-09-24T10:00:00.000Z", clipIds: [clip.id] });

describe("render artifact paths", () => {
  it("creates safe names that separate duplicate ideas and brands by IDs", () => {
    const first = renderArtifactPaths(batch, clip, starterBrands[0], "11111111-aaaa-4aaa-8aaa-111111111111", "C:/studio");
    const second = renderArtifactPaths(batch, clip, { ...starterBrands[0], id: "sabre" }, "22222222-aaaa-4aaa-8aaa-222222222222", "C:/studio");
    expect(first.video).not.toBe(second.video);
    expect(first.video).toMatch(/^exports\/batches\/batch-001\/clipflow-first-announcement-/);
    expect(first.videoAbsolute).toContain("C:\\studio\\exports\\batches");
    expect(slug("Áwesome / Idea!")).toBe("awesome-idea");
  });
});
