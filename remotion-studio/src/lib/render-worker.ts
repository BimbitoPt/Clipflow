import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { getBrand } from "./brand-store";
import { getBatch, updateClip } from "./batch-store";
import { resolveInside } from "./file-store";
import { compositionId, buildCompositionProps } from "./scene-plan";
import { renderArtifactPaths } from "./render-artifacts";
import { queuedJob, recoverInterruptedJobs, setJobProgress, setJobResult, type RenderJob } from "./render-queue";

async function mediaFingerprint(root: string) {
  const assetsRoot = resolveInside(root, "public", "local-assets");
  const hash = createHash("sha256");
  async function visit(directory: string, fingerprintRoot: string) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, fingerprintRoot);
      else { const info = await stat(absolute); hash.update(`${path.relative(fingerprintRoot, absolute)}:${info.size}:${info.mtimeMs};`); }
    }
  }
  await visit(assetsRoot, root);
  await visit(resolveInside(root, "src", "remotion"), root);
  for (const source of ["src/lib/domain.ts", "src/lib/scene-plan.ts", "src/lib/seed-brands.ts"]) {
    const absolute = resolveInside(root, source);
    const info = await stat(absolute);
    hash.update(`${source}:${info.size}:${info.mtimeMs};`);
  }
  return hash.digest("hex");
}

async function createBundle(root: string, fingerprint: string) {
  const entryPoint = resolveInside(root, "src", "remotion", "entry.tsx");
  const outDir = resolveInside(root, "data", "bundles", fingerprint);
  await mkdir(path.dirname(outDir), { recursive: true });
  console.log(`[remotion] bundling composition assets (${fingerprint.slice(0, 10)})`);
  return bundle({ entryPoint, outDir, publicDir: resolveInside(root, "public"), enableCaching: true });
}

async function renderOne(job: RenderJob, appRoot: string, dataRoot: string, getServeUrl: () => Promise<string>, onProgress: (job: RenderJob, value: number) => Promise<void>) {
  const batchData = await getBatch(job.batchId, dataRoot);
  if (!batchData) throw new Error("The queued batch no longer exists");
  const clip = batchData.clips.find((item) => item.id === job.clipId);
  if (!clip) throw new Error("The queued clip no longer exists");
  const brand = await getBrand(clip.brandId, dataRoot);
  if (!brand) throw new Error(`Brand kit ${clip.brandId} is missing`);
  const props = buildCompositionProps(clip, brand);
  const serveUrl = await getServeUrl();
  const composition = await selectComposition({ serveUrl, id: compositionId(clip.format), inputProps: props });
  const paths = renderArtifactPaths(batchData.batch, clip, brand, job.id, appRoot);
  await mkdir(path.dirname(paths.videoAbsolute), { recursive: true });
  let lastPercent = -1, lastTime = 0;
  let progressWrites = Promise.resolve();
  try {
    await renderMedia({
      composition,
      serveUrl,
      inputProps: props,
      codec: "h264",
      audioCodec: "aac",
      enforceAudioTrack: true,
      pixelFormat: "yuv420p",
      crf: 19,
      x264Preset: "fast",
      concurrency: 2,
      outputLocation: paths.videoAbsolute,
      overwrite: true,
      onProgress: ({ progress }) => {
        const percent = Math.floor(progress * 100);
        if (percent !== lastPercent && Date.now() - lastTime > 700) {
          lastPercent = percent; lastTime = Date.now();
          progressWrites = progressWrites.then(() => onProgress(job, progress)).catch((error) => {
            console.error(`[remotion] progress update failed: ${String(error)}`);
          });
        }
      },
    });
    await progressWrites;
    const coverFrame = Math.min(props.totalFrames - 1, Math.floor(props.scenes[0].durationInFrames / 2));
    const coverProps = { ...props, coverMode: true };
    const coverComposition = await selectComposition({ serveUrl, id: compositionId(clip.format), inputProps: coverProps });
    await renderStill({ composition: coverComposition, serveUrl, inputProps: coverProps, frame: coverFrame, output: paths.coverAbsolute, imageFormat: "png", overwrite: true });
    await progressWrites;
    return { outputPath: paths.video, coverPath: paths.cover };
  } catch (error) {
    await Promise.all([rm(paths.videoAbsolute, { force: true }), rm(paths.coverAbsolute, { force: true })]);
    throw error;
  }
}

async function acquireWorkerLock(root: string) {
  const lockPath = resolveInside(root, "data", "worker.lock");
  await mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => { await rm(lockPath, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let pid = 0;
      try { pid = Number(await readFile(lockPath, "utf8")); } catch { /* stale lock */ }
      let alive = false;
      if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); alive = true; } catch { alive = false; } }
      if (alive) throw new Error(`Render worker ${pid} already owns the local queue`);
      await rm(lockPath, { force: true });
    }
  }
  throw new Error("Could not claim the render worker lock");
}

export async function runRenderWorker(options: { root?: string; pollMs?: number } = {}) {
  const root = options.root ?? process.cwd();
  const pollMs = options.pollMs ?? 1500;
  const releaseLock = await acquireWorkerLock(root);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    await recoverInterruptedJobs(path.join(root, "data"));
    let currentFingerprint = "";
    let currentServeUrl = "";
    const getServeUrl = async () => {
      const nextFingerprint = await mediaFingerprint(root);
      if (nextFingerprint !== currentFingerprint) {
        currentServeUrl = await createBundle(root, nextFingerprint);
        currentFingerprint = nextFingerprint;
      }
      return currentServeUrl;
    };
    while (!stopping) {
      const job = await queuedJob(path.join(root, "data"));
      if (!job) { await new Promise((resolve) => setTimeout(resolve, pollMs)); continue; }
      console.log(`[remotion] rendering ${job.clipId}`);
      try {
        const dataRoot = path.join(root, "data");
        const artifacts = await renderOne(job, root, dataRoot, getServeUrl, async (active, progress) => {
          await setJobProgress(active.id, progress, dataRoot);
          const batch = await getBatch(active.batchId, dataRoot);
          const clip = batch?.clips.find((item) => item.id === active.clipId);
          if (clip?.status === "rendering") {
            await updateClip(active.batchId, active.clipId, { ...clip, progress, updatedAt: new Date().toISOString() }, dataRoot);
          }
        });
        await setJobResult(job, { ok: true, ...artifacts }, path.join(root, "data"));
        console.log(`[remotion] completed ${job.clipId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await setJobResult(job, { ok: false, error: message }, path.join(root, "data"));
        console.error(`[remotion] failed ${job.clipId}: ${message}`);
      }
    }
  } finally {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    await releaseLock();
  }
}
