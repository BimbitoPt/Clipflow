import { open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { getBatch, updateClip } from "./batch-store";
import { resolveInside } from "./file-store";
import { defaultVoiceoverScript } from "./voiceover-script";
import { completeVoiceoverJob, getQueuedVoiceoverClip, queuedVoiceoverJob, recordVoiceoverResult, recoverVoiceoverJobs, type VoiceoverJob } from "./voiceover-queue";
import { generateVoiceover } from "./voiceover";
import { autoCaptionCues } from "./caption-cues";
import { normalizeVoiceover } from "./voiceover-production";

async function acquireLock(root: string) {
  const lockPath = resolveInside(root, "data", "voiceover-worker.lock");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(lockPath), { recursive: true }));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lockPath, "wx"); await handle.writeFile(String(process.pid)); await handle.close();
      return async () => { await rm(lockPath, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let pid = 0;
      try { pid = Number(await readFile(lockPath, "utf8")); } catch { /* stale lock */ }
      let alive = false;
      if (pid > 0) { try { process.kill(pid, 0); alive = true; } catch { alive = false; } }
      if (alive) throw new Error(`Voiceover worker ${pid} already owns the local queue`);
      await rm(lockPath, { force: true });
    }
  }
  throw new Error("Could not claim the local voiceover queue");
}

async function runJob(job: VoiceoverJob, root: string) {
  const processedClipIds = new Set(job.processedClipIds);
  while (true) {
    const clip = await getQueuedVoiceoverClip({ ...job, processedClipIds: [...processedClipIds] }, path.join(root, "data"));
    if (!clip) break;
    const initialScript = clip.voiceover.script.trim() || defaultVoiceoverScript(clip);
    try {
      const generated = await generateVoiceover(initialScript, clip.id, root, undefined, { maxDurationSeconds: clip.durationSeconds, voiceId: clip.voiceover.voiceId });
      const fresh = (await getBatch(job.batchId, path.join(root, "data")))?.clips.find((item) => item.id === clip.id);
      const currentScript = fresh ? (fresh.voiceover.script.trim() || defaultVoiceoverScript(fresh)) : "";
      if (!fresh || fresh.voiceover.audioPath || fresh.status === "rendering" || currentScript !== initialScript || fresh.durationSeconds !== clip.durationSeconds || fresh.voiceover.voiceId !== clip.voiceover.voiceId) {
        if (fresh?.voiceover.audioPath !== generated.audioPath) await rm(resolveInside(root, "public", generated.audioPath), { force: true });
        await recordVoiceoverResult(job.id, { clipId: clip.id, status: "skipped" }, path.join(root, "data"));
        processedClipIds.add(clip.id);
        continue;
      }
      const normalized = await normalizeVoiceover(generated, root);
      const creative = fresh.creative ? { ...fresh.creative, captionCues: autoCaptionCues(initialScript, normalized.wordTimings) } : null;
      await updateClip(fresh.batchId, fresh.id, { ...fresh, creative, voiceover: { ...fresh.voiceover, script: initialScript, ...normalized }, status: "needs_review", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: new Date().toISOString() }, path.join(root, "data"));
      await recordVoiceoverResult(job.id, { clipId: clip.id, status: "generated" }, path.join(root, "data"));
      processedClipIds.add(clip.id);
    } catch (error) {
      await recordVoiceoverResult(job.id, { clipId: clip.id, status: "failed", error: error instanceof Error ? error.message : "Voiceover generation failed" }, path.join(root, "data"));
      processedClipIds.add(clip.id);
    }
  }
  await completeVoiceoverJob(job.id, path.join(root, "data"));
}

export async function runVoiceoverWorker(options: { root?: string; pollMs?: number } = {}) {
  const root = options.root ?? process.cwd();
  const pollMs = options.pollMs ?? 1500;
  const releaseLock = await acquireLock(root);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const dataRoot = path.join(root, "data");
    await recoverVoiceoverJobs(dataRoot);
    while (!stopping) {
      const job = await queuedVoiceoverJob(dataRoot);
      if (!job) { await new Promise((resolve) => setTimeout(resolve, pollMs)); continue; }
      console.log(`[remotion] generating voiceovers for ${job.batchId}`);
      await runJob(job, root);
      console.log(`[remotion] voiceovers complete for ${job.batchId}`);
    }
  } finally {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    await releaseLock();
  }
}
