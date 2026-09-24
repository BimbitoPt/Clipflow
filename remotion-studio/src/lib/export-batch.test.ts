import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BatchSchema, ClipBriefSchema } from "./domain";
import { buildBatchExportPlan, createBatchZip } from "./export-batch";
import { starterBrands } from "./seed-brands";
import type { BatchWithClips } from "./batch-store";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

function clip(id: string, status: "rendered" | "failed" | "approved", outputPath: string | null, coverPath: string | null) {
  return ClipBriefSchema.parse({
    id, batchId: "batch-export-001", brandId: "clipflow", concept: "Same concept", hook: "Hook", keyMessage: "Message",
    supportingPoint: null, proof: null, cta: "Try it", format: "explainer", durationSeconds: 25,
    sceneCopy: ["Hook", "Message"], postCopy: `Post copy for ${id}`, mediaOverrides: [], status,
    progress: status === "rendered" ? 1 : 0, outputPath, coverPath, renderError: status === "failed" ? "Render failed" : null,
    updatedAt: "2026-09-24T10:00:00.000Z",
  });
}

function zipNames(bytes: Buffer) {
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("ZIP end directory not found");
  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let index = 0; index < count; index++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid ZIP central directory");
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    names.push(bytes.toString("utf8", offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

describe("batch ZIP export", () => {
  it("packages only completed clips with both artifacts and keeps failures in the manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clipflow-export-")); roots.push(root);
    await mkdir(path.join(root, "exports"), { recursive: true });
    await writeFile(path.join(root, "exports", "one.mp4"), "video one");
    await writeFile(path.join(root, "exports", "one.png"), "cover one");
    await writeFile(path.join(root, "exports", "two.mp4"), "video two");
    await writeFile(path.join(root, "exports", "two.png"), "cover two");
    const clips = [
      clip("clip-export-001", "rendered", "exports/one.mp4", "exports/one.png"),
      clip("clip-export-002", "rendered", "exports/two.mp4", "exports/two.png"),
      clip("clip-export-003", "failed", "exports/fail.mp4", "exports/fail.png"),
      clip("clip-export-004", "approved", null, null),
      clip("clip-export-005", "rendered", "exports/missing.mp4", "exports/missing.png"),
    ];
    const batchData: BatchWithClips = {
      batch: BatchSchema.parse({ id: "batch-export-001", name: "September Batch", createdAt: "2026-09-24T10:00:00.000Z", updatedAt: "2026-09-24T10:00:00.000Z", clipIds: clips.map((item) => item.id) }),
      clips,
    };
    const plan = await buildBatchExportPlan(batchData, starterBrands, root);
    expect(plan.entries.map((entry) => entry.name)).toHaveLength(6);
    const exportedVideos = plan.entries.filter((entry) => entry.name.endsWith(".mp4"));
    expect(exportedVideos.map((entry) => entry.name)).toHaveLength(2);
    expect(exportedVideos[0].name).not.toBe(exportedVideos[1].name);
    expect(plan.entries.filter((entry) => entry.name.endsWith("-post.txt")).map((entry) => entry.content)).toEqual(["Post copy for clip-export-001", "Post copy for clip-export-002"]);
    expect(plan.manifest.clips.map((item) => item.status)).toEqual(["rendered", "rendered", "failed", "approved", "rendered"]);
    expect(plan.manifest.clips[2].files).toEqual([]);
    expect(plan.manifest.clips[4].files).toEqual([]);
    const chunks: Buffer[] = [];
    const zip = createBatchZip(plan);
    for await (const chunk of zip) chunks.push(Buffer.from(chunk));
    expect(zipNames(Buffer.concat(chunks))).toEqual(expect.arrayContaining([...plan.entries.map((entry) => entry.name), "manifest.json"]));
  });

  it("refuses to export a batch without complete ready artifacts", async () => {
    const batchData: BatchWithClips = {
      batch: BatchSchema.parse({ id: "batch-export-002", name: "Empty", createdAt: "2026-09-24T10:00:00.000Z", updatedAt: "2026-09-24T10:00:00.000Z", clipIds: ["clip-export-006"] }),
      clips: [clip("clip-export-006", "failed", null, null)],
    };
    await expect(buildBatchExportPlan(batchData, starterBrands, os.tmpdir())).rejects.toThrow("no completed clips");
  });
});
