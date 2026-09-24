import path from "node:path";
import type { BrandKit, Batch, ClipBrief } from "./domain";
import { resolveInside } from "./file-store";

export function slug(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "clip";
}

export function renderArtifactPaths(batch: Batch, clip: ClipBrief, brand: BrandKit, jobId: string, cwd = process.cwd()) {
  const base = `${slug(brand.id)}-${slug(clip.concept)}-${clip.id.slice(-8)}-${jobId.slice(0, 8)}`;
  const directory = `exports/batches/${batch.id}`;
  const video = `${directory}/${base}.mp4`;
  const cover = `${directory}/${base}-cover.png`;
  return { video, cover, videoAbsolute: resolveInside(cwd, video), coverAbsolute: resolveInside(cwd, cover) };
}

export function relativeArtifactPath(absolutePath: string, cwd = process.cwd()) {
  const relative = path.relative(cwd, absolutePath).replace(/\\/g, "/");
  resolveInside(cwd, relative);
  return relative;
}
