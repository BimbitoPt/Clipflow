import { z } from "zod";
import { getBatch, updateClip } from "./batch-store";
import type { ClipBrief } from "./domain";
import { appDataRoot, readJson, resolveInside, writeJsonAtomic } from "./file-store";

const JobSchema = z.object({
  id: z.string().min(1), batchId: z.string(), clipId: z.string(), status: z.enum(["queued", "running", "complete", "failed"]),
  progress: z.number().min(0).max(1), error: z.string().max(500).nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type RenderJob = z.infer<typeof JobSchema>;

function queuePath(root: string) { return resolveInside(root, "render-queue.json"); }
async function readJobs(root: string): Promise<RenderJob[]> {
  const value = await readJson<unknown>(queuePath(root));
  if (value === null) return [];
  return z.array(JobSchema).parse(value);
}
async function saveJobs(root: string, jobs: RenderJob[]) { await writeJsonAtomic(root, queuePath(root), jobs); }

export async function enqueueApproved(batchId: string, root = appDataRoot()) {
  const batch = await getBatch(batchId, root);
  if (!batch) throw new Error("Batch not found");
  const jobs = await readJobs(root);
  const activeClipIds = new Set(jobs.filter((job) => job.status === "queued" || job.status === "running").map((job) => job.clipId));
  const clips = batch.clips.filter((clip) => ["approved", "rendered"].includes(clip.status) && !activeClipIds.has(clip.id));
  if (!clips.length) throw new Error("Approve at least one clip before rendering");
  const now = new Date().toISOString();
  const queued = clips.map((clip) => ({ id: crypto.randomUUID(), batchId, clipId: clip.id, status: "queued" as const, progress: 0, error: null, createdAt: now, updatedAt: now }));
  await saveJobs(root, [...jobs, ...queued]);
  for (const clip of clips) await updateClip(batchId, clip.id, { ...clip, status: "rendering", progress: 0, renderError: null, updatedAt: now }, root);
  return queued;
}

export async function getRenderStatus(batchId: string, clipId: string, root = appDataRoot()) {
  const [jobs, batch] = await Promise.all([readJobs(root), getBatch(batchId, root)]);
  const clip = batch?.clips.find((item) => item.id === clipId) ?? null;
  const job = jobs.filter((item) => item.batchId === batchId && item.clipId === clipId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  return { clip, job };
}

export async function queuedJob(root = appDataRoot()): Promise<RenderJob | null> {
  const jobs = await readJobs(root);
  const next = jobs.find((job) => job.status === "queued");
  if (!next) return null;
  const running = { ...next, status: "running" as const, updatedAt: new Date().toISOString() };
  await saveJobs(root, jobs.map((job) => job.id === next.id ? running : job));
  return running;
}

export async function setJobProgress(jobId: string, progress: number, root = appDataRoot()) {
  const jobs = await readJobs(root);
  await saveJobs(root, jobs.map((job) => job.id === jobId && job.status === "running" ? { ...job, progress: Math.max(job.progress, Math.min(1, progress)), updatedAt: new Date().toISOString() } : job));
}

export async function setJobResult(job: RenderJob, result: { ok: true; outputPath: string; coverPath: string } | { ok: false; error: string }, root = appDataRoot()) {
  const jobs = await readJobs(root);
  const now = new Date().toISOString();
  const current = jobs.find((item) => item.id === job.id) ?? job;
  const complete: RenderJob = result.ok
    ? { ...current, status: "complete", progress: 1, error: null, updatedAt: now }
    : { ...current, status: "failed", error: result.error.slice(0, 500), updatedAt: now };
  await saveJobs(root, jobs.map((item) => item.id === job.id ? complete : item));
  const batch = await getBatch(job.batchId, root);
  const clip = batch?.clips.find((item) => item.id === job.clipId);
  if (!clip) throw new Error("Render job refers to a missing clip");
  const updated: ClipBrief = result.ok
    ? { ...clip, status: "rendered", progress: 1, outputPath: result.outputPath, coverPath: result.coverPath, renderError: null, updatedAt: now }
    : { ...clip, status: "failed", renderError: result.error.slice(0, 500), progress: clip.progress, updatedAt: now };
  await updateClip(job.batchId, job.clipId, updated, root);
}

export async function recoverInterruptedJobs(root = appDataRoot()) {
  const jobs = await readJobs(root);
  const now = new Date().toISOString();
  const recovered = jobs.map((job) => job.status === "running" ? { ...job, status: "queued" as const, progress: 0, updatedAt: now } : job);
  if (jobs.some((job) => job.status === "running")) await saveJobs(root, recovered);
  for (const job of jobs.filter((item) => item.status === "running")) {
    const batch = await getBatch(job.batchId, root);
    const clip = batch?.clips.find((item) => item.id === job.clipId);
    if (clip?.status === "rendering") await updateClip(job.batchId, job.clipId, { ...clip, status: "approved", progress: 0, renderError: null, updatedAt: now }, root);
  }
}

export async function getAllJobs(root = appDataRoot()) { return readJobs(root); }
