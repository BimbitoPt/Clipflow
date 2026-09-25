import { z } from "zod";
import { getBatch } from "./batch-store";
import { appDataRoot, readJson, resolveInside, writeJsonAtomic } from "./file-store";

const JobSchema = z.object({
  id: z.string().min(1), batchId: z.string(), status: z.enum(["queued", "running", "complete", "failed"]), error: z.string().max(500).nullable().default(null),
  total: z.number().int().min(0).max(20), processed: z.number().int().min(0).max(20),
  generated: z.number().int().min(0).max(20), skipped: z.number().int().min(0).max(20), failed: z.number().int().min(0).max(20),
  errors: z.array(z.object({ clipId: z.string(), message: z.string().max(500) })).max(20),
  processedClipIds: z.array(z.string()).max(20), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type VoiceoverJob = z.infer<typeof JobSchema>;
const QUEUED_STALE_MS = 90_000;
const RUNNING_STALE_MS = 10 * 60_000;
function queuePath(root: string) { return resolveInside(root, "voiceover-queue.json"); }
async function readJobs(root: string): Promise<VoiceoverJob[]> {
  const value = await readJson<unknown>(queuePath(root));
  return value === null ? [] : z.array(JobSchema).parse(value);
}
async function saveJobs(root: string, jobs: VoiceoverJob[]) { await writeJsonAtomic(root, queuePath(root), jobs); }

export async function enqueueMissingVoiceovers(batchId: string, root = appDataRoot()) {
  const batch = await getBatch(batchId, root);
  if (!batch) throw new Error("Batch not found");
  const jobs = await readJobs(root);
  const active = jobs.find((job) => job.batchId === batchId && ["queued", "running"].includes(job.status));
  if (active) return active;
  const clips = batch.clips.filter((clip) => !clip.voiceover.audioPath && clip.status !== "rendering");
  if (!clips.length) throw new Error("Every clip already has a voiceover or is rendering");
  const now = new Date().toISOString();
  const job = JobSchema.parse({ id: crypto.randomUUID(), batchId, status: "queued", total: clips.length, processed: 0, generated: 0, skipped: 0, failed: 0, errors: [], processedClipIds: [], createdAt: now, updatedAt: now });
  await saveJobs(root, [...jobs, job]);
  return job;
}

export async function queuedVoiceoverJob(root = appDataRoot()) {
  const jobs = await readJobs(root);
  const next = jobs.find((job) => job.status === "queued");
  if (!next) return null;
  const running = { ...next, status: "running" as const, updatedAt: new Date().toISOString() };
  await saveJobs(root, jobs.map((job) => job.id === next.id ? running : job));
  return running;
}

export async function recordVoiceoverResult(jobId: string, result: { clipId: string; status: "generated" | "skipped" | "failed"; error?: string }, root = appDataRoot()) {
  const jobs = await readJobs(root);
  const current = jobs.find((job) => job.id === jobId);
  if (!current || current.status !== "running" || current.processedClipIds.includes(result.clipId)) return;
  const updated: VoiceoverJob = {
    ...current,
    processed: Math.min(current.total, current.processed + 1),
    generated: current.generated + Number(result.status === "generated"),
    skipped: current.skipped + Number(result.status === "skipped"),
    failed: current.failed + Number(result.status === "failed"),
    errors: result.error ? [...current.errors, { clipId: result.clipId, message: result.error.slice(0, 500) }].slice(-20) : current.errors,
    processedClipIds: [...current.processedClipIds, result.clipId], updatedAt: new Date().toISOString(),
  };
  await saveJobs(root, jobs.map((job) => job.id === jobId ? updated : job));
}

export async function completeVoiceoverJob(jobId: string, root = appDataRoot()) {
  const jobs = await readJobs(root);
  await saveJobs(root, jobs.map((job) => job.id === jobId ? { ...job, status: "complete", processed: job.total, updatedAt: new Date().toISOString() } : job));
}

export async function recoverVoiceoverJobs(root = appDataRoot()) {
  const jobs = await readJobs(root);
  if (!jobs.some((job) => job.status === "running")) return;
  await saveJobs(root, jobs.map((job) => job.status === "running" ? { ...job, status: "queued", updatedAt: new Date().toISOString() } : job));
}

export async function getVoiceoverJob(batchId: string, root = appDataRoot()) {
  let jobs = await readJobs(root);
  const job = jobs.filter((item) => item.batchId === batchId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  if (!job || !isVoiceoverJobStale(job)) return job;
  const error = job.status === "queued" ? "Voiceover worker did not start this job. Retry to queue it again." : "Voiceover worker stopped responding. Retry to resume the remaining clips.";
  const failed: VoiceoverJob = { ...job, status: "failed", error, updatedAt: new Date().toISOString() };
  jobs = jobs.map((item) => item.id === job.id ? failed : item);
  await saveJobs(root, jobs);
  return failed;
}

export function isVoiceoverJobStale(job: VoiceoverJob, now = Date.now()) {
  if (job.status !== "queued" && job.status !== "running") return false;
  const age = now - Date.parse(job.updatedAt);
  return age > (job.status === "queued" ? QUEUED_STALE_MS : RUNNING_STALE_MS);
}

export async function getQueuedVoiceoverClip(job: VoiceoverJob, root = appDataRoot()) {
  const batch = await getBatch(job.batchId, root);
  return batch?.clips.find((clip) => !clip.voiceover.audioPath && clip.status !== "rendering" && !job.processedClipIds.includes(clip.id)) ?? null;
}
