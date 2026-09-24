import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBatch, getBatch, listBatches, type CreateBrief } from "./batch-store";

let root: string | undefined;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = undefined; });

function briefs(count: number): CreateBrief[] {
  return Array.from({ length: count }, (_, index) => ({ brandId: index % 2 ? "mstudio" : "clipflow", concept: `Concept ${index + 1}`, hook: `Hook ${index + 1}`, keyMessage: `Message ${index + 1}`, format: index % 3 ? "explainer" : "demo" }));
}

describe("batch persistence", () => {
  it("creates and reloads a mixed-brand batch of 10 through 20 briefs", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "clipflow-batches-"));
    const created = await createBatch("Launch week", briefs(10), root);
    expect(created.clips).toHaveLength(10);
    expect(new Set(created.clips.map((clip) => clip.brandId))).toEqual(new Set(["clipflow", "mstudio"]));
    expect(created.clips.every((clip) => clip.status === "needs_review")).toBe(true);
    expect((await getBatch(created.batch.id, root))?.clips).toHaveLength(10);
    expect((await listBatches(root))).toHaveLength(1);
    expect((await createBatch("Twenty", briefs(20), root)).clips).toHaveLength(20);
  });
  it("rejects batches outside 10–20 clips", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "clipflow-batches-"));
    await expect(createBatch("Short", briefs(9), root)).rejects.toThrow("10–20");
    await expect(createBatch("Long", briefs(21), root)).rejects.toThrow("10–20");
  });
});
