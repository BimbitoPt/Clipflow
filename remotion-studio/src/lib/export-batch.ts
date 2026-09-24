import archiver from "archiver";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { PassThrough } from "node:stream";
import type { BatchWithClips } from "./batch-store";
import type { BrandKit } from "./domain";
import { resolveInside } from "./file-store";
import { slug } from "./render-artifacts";

export type ExportEntry = { source?: string; content?: string; name: string };
export type BatchExportPlan = {
  filename: string;
  manifest: {
    schemaVersion: 1;
    batch: { id: string; name: string; createdAt: string };
    clips: Array<{
      id: string; brandId: string; brandName: string | null; concept: string; format: string;
      durationSeconds: number; status: string; files: string[]; renderError: string | null;
      deliverableStatus: "ready" | "missing_artifact" | "failed" | "approved" | "needs_review" | "draft" | "rendering";
    }>;
  };
  entries: ExportEntry[];
};

export async function buildBatchExportPlan(batchData: BatchWithClips, brands: BrandKit[], cwd = process.cwd()): Promise<BatchExportPlan> {
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const entries: ExportEntry[] = [];
  const clips = [];

  for (const clip of batchData.clips) {
    const files: string[] = [];
    if (clip.status === "rendered" && clip.outputPath && clip.coverPath) {
      const videoSource = resolveInside(cwd, clip.outputPath);
      const coverSource = resolveInside(cwd, clip.coverPath);
      const [videoInfo, coverInfo] = await Promise.all([
        stat(videoSource).catch(() => null),
        stat(coverSource).catch(() => null),
      ]);
      if (videoInfo?.isFile() && coverInfo?.isFile()) {
        const brand = brandById.get(clip.brandId);
        const directory = `${slug(clip.brandId)}-${slug(brand?.name ?? clip.brandId)}`;
        const base = `${slug(clip.concept)}-${clip.id.slice(-8)}`;
        const videoName = `${directory}/${base}.mp4`;
        const coverName = `${directory}/${base}-cover.png`;
        const postName = `${directory}/${base}-post.txt`;
        entries.push({ source: videoSource, name: videoName }, { source: coverSource, name: coverName });
        entries.push({ content: clip.postCopy, name: postName });
        files.push(videoName, coverName, postName);
      }
    }
    const deliverableStatus: BatchExportPlan["manifest"]["clips"][number]["deliverableStatus"] = files.length
      ? "ready"
      : clip.status === "rendered" ? "missing_artifact" : clip.status;
    clips.push({
      id: clip.id,
      brandId: clip.brandId,
      brandName: brandById.get(clip.brandId)?.name ?? null,
      concept: clip.concept,
      format: clip.format,
      durationSeconds: clip.durationSeconds,
      status: clip.status,
      files,
      renderError: clip.renderError,
      deliverableStatus,
    });
  }

  if (!entries.length) throw new Error("This batch has no completed clips with available video and cover files");
  return {
    filename: `${slug(batchData.batch.name)}-${batchData.batch.id.slice(-8)}.zip`,
    manifest: {
      schemaVersion: 1,
      batch: { id: batchData.batch.id, name: batchData.batch.name, createdAt: batchData.batch.createdAt },
      clips,
    },
    entries,
  };
}

export function createBatchZip(plan: BatchExportPlan) {
  const output = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);
  for (const entry of plan.entries) {
    if (entry.source) archive.append(createReadStream(entry.source), { name: entry.name });
    else archive.append(entry.content ?? "", { name: entry.name });
  }
  archive.append(`${JSON.stringify(plan.manifest, null, 2)}\n`, { name: "manifest.json" });
  void archive.finalize().catch((error: unknown) => output.destroy(error instanceof Error ? error : new Error(String(error))));
  return output;
}
