import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { getBatch, updateClip } from "../src/lib/batch-store";
import { getBrand } from "../src/lib/brand-store";
import { resolveInside } from "../src/lib/file-store";
import { buildCompositionProps, compositionId } from "../src/lib/scene-plan";

async function main() {
  const batchId = process.argv[2];
  if (!batchId) throw new Error("Usage: npx tsx scripts/refresh-covers.ts <batch-id> [--limit-one]");
  const root = process.cwd();
  const batch = await getBatch(batchId);
  if (!batch) throw new Error(`Batch ${batchId} not found`);
  const clips = batch.clips.filter((clip) => clip.status === "rendered" && clip.coverPath);
  if (!clips.length) throw new Error("No rendered covers to refresh");
  const selected = process.argv.includes("--limit-one") ? clips.slice(0, 1) : clips;
  const serveUrl = await bundle({
    entryPoint: path.join(root, "src", "remotion", "entry.tsx"),
    publicDir: path.join(root, "public"),
    outDir: path.join(root, "data", "bundles", `cover-refresh-${Date.now()}`),
    enableCaching: true,
  });

  for (const clip of selected) {
    const brand = await getBrand(clip.brandId);
    if (!brand) throw new Error(`Brand ${clip.brandId} not found`);
    const props = { ...buildCompositionProps(clip, brand), coverMode: true };
    const composition = await selectComposition({ serveUrl, id: compositionId(clip.format), inputProps: props });
    if (!composition.props.coverMode) throw new Error(`Cover mode was not passed to ${clip.id}`);
    const frame = Math.min(props.totalFrames - 1, Math.floor(props.scenes[0].durationInFrames / 2));
    const nextCover = clip.coverPath!.replace(/-cover(?:-clean)?\.png$/, "-cover-clean.png");
    if (nextCover === clip.coverPath && !nextCover.endsWith("-cover-clean.png")) throw new Error(`Unexpected cover path for ${clip.id}`);
    await renderStill({ composition, serveUrl, inputProps: props, frame, output: resolveInside(root, nextCover), imageFormat: "png", overwrite: true });
    await updateClip(batchId, clip.id, { ...clip, coverPath: nextCover, updatedAt: new Date().toISOString() });
    console.log(`Refreshed ${clip.id}: ${nextCover}`);
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
