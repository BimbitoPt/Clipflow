import { describe, expect, it } from "vitest";
import { BatchSchema, BrandKitSchema, ClipBriefSchema } from "./domain";
import { starterBrands } from "./seed-brands";

const validClip = {
  id: "clip-001", batchId: "batch-001", brandId: "clipflow", concept: "Show the workflow", hook: "A video in minutes",
  keyMessage: "Turn a brief into a finished video.", supportingPoint: null, proof: null, cta: "Try Clipflow", format: "explainer",
  durationSeconds: 25, sceneCopy: ["Start with an idea", "Finish with a video"], postCopy: "A short post.", mediaOverrides: [], status: "draft",
  progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: "2026-09-24T10:00:00.000Z",
};

describe("studio domain schemas", () => {
  it("accepts both source-backed starter brand kits", () => {
    expect(starterBrands.map((brand) => BrandKitSchema.parse(brand).id)).toEqual(["clipflow", "mstudio"]);
  });

  it("validates clip duration, format and safe media paths", () => {
    expect(ClipBriefSchema.parse(validClip).durationSeconds).toBe(25);
    expect(ClipBriefSchema.safeParse({ ...validClip, durationSeconds: 9 }).success).toBe(false);
    expect(ClipBriefSchema.safeParse({ ...validClip, format: "viral" }).success).toBe(false);
    expect(ClipBriefSchema.safeParse({ ...validClip, mediaOverrides: ["../../secret.mp4"] }).success).toBe(false);
  });

  it("requires at least one and no more than twenty clips in a batch", () => {
    const valid = { id: "batch-001", name: "September launch", createdAt: "2026-09-24T10:00:00.000Z", updatedAt: "2026-09-24T10:00:00.000Z", clipIds: ["clip-001"] };
    expect(BatchSchema.safeParse(valid).success).toBe(true);
    expect(BatchSchema.safeParse({ ...valid, clipIds: [] }).success).toBe(false);
    expect(BatchSchema.safeParse({ ...valid, clipIds: Array.from({ length: 21 }, (_, i) => `clip-${String(i).padStart(3, "0")}`) }).success).toBe(false);
  });
});
