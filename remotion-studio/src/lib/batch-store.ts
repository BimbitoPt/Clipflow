import { mkdir, readdir } from "node:fs/promises";
import { BatchSchema, ClipBriefSchema, defaultVoiceIdForBrand, type Batch, type ClipBrief } from "./domain";
import { appDataRoot, readJson, resolveInside, writeJsonAtomic } from "./file-store";

export type CreateBrief = {
  brandId: string; concept: string; hook: string; keyMessage: string; supportingPoint?: string; proof?: string;
  cta?: string; format?: "explainer" | "demo" | "proof"; durationSeconds?: number; postCopy?: string;
};

function batchDir(root: string, id: string) { return resolveInside(root, "batches", id); }
function batchFile(root: string, id: string) { return resolveInside(batchDir(root, id), "batch.json"); }
function clipFile(root: string, batchId: string, clipId: string) { return resolveInside(batchDir(root, batchId), "clips", `${clipId}.json`); }

export type BatchWithClips = { batch: Batch; clips: ClipBrief[] };

export async function createBatch(name: string, briefs: CreateBrief[], root = appDataRoot()): Promise<BatchWithClips> {
  if (briefs.length < 10 || briefs.length > 20) throw new Error("A batch must contain 10–20 clips");
  const now = new Date().toISOString();
  const id = `batch-${crypto.randomUUID()}`;
  const clips = briefs.map((brief) => {
    const clipId = `clip-${crypto.randomUUID()}`;
    const sceneCopy = [brief.hook, brief.supportingPoint || brief.keyMessage, brief.proof || brief.keyMessage, brief.cta || "Learn more."];
    return ClipBriefSchema.parse({
      ...brief, id: clipId, batchId: id, concept: brief.concept, hook: brief.hook, keyMessage: brief.keyMessage,
      supportingPoint: brief.supportingPoint || null, proof: brief.proof || null, cta: brief.cta || "Learn more.",
      format: brief.format || "explainer", durationSeconds: brief.durationSeconds || 25,
      sceneCopy, postCopy: brief.postCopy || `${brief.hook}\n\n${brief.keyMessage}\n\n${brief.cta || "Learn more."}`,
      voiceover: { script: "", voiceId: defaultVoiceIdForBrand(brief.brandId), audioPath: null, wordTimings: [], generatedFor: null },
      mediaOverrides: [], status: "needs_review", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: now,
    });
  });
  const batch = BatchSchema.parse({ id, name: name.trim() || `Batch ${new Date().toLocaleDateString()}`, createdAt: now, updatedAt: now, clipIds: clips.map((clip) => clip.id) });
  await mkdir(resolveInside(batchDir(root, id), "clips"), { recursive: true });
  await Promise.all(clips.map((clip) => writeJsonAtomic(root, clipFile(root, id, clip.id), clip)));
  await writeJsonAtomic(root, batchFile(root, id), batch);
  return { batch, clips };
}

export async function getBatch(id: string, root = appDataRoot()): Promise<BatchWithClips | null> {
  const parsed = await readJson<unknown>(batchFile(root, id));
  if (parsed === null) return null;
  const batch = BatchSchema.parse(parsed);
  const clips = await Promise.all(batch.clipIds.map(async (clipId) => {
    const clip = await readJson<unknown>(clipFile(root, id, clipId));
    if (clip === null) throw new Error(`Batch is missing clip data: ${clipId}`);
    return ClipBriefSchema.parse(clip);
  }));
  return { batch, clips };
}

export async function listBatches(root = appDataRoot()): Promise<BatchWithClips[]> {
  const dir = resolveInside(root, "batches");
  await mkdir(dir, { recursive: true });
  const ids = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^batch-[a-f0-9-]{36}$/.test(entry.name)).map((entry) => entry.name);
  const batches = await Promise.all(ids.map((id) => getBatch(id, root)));
  return (batches.filter((item): item is BatchWithClips => Boolean(item))).sort((a, b) => b.batch.createdAt.localeCompare(a.batch.createdAt));
}

export async function updateClip(batchId: string, clipId: string, clip: ClipBrief, root = appDataRoot()): Promise<ClipBrief> {
  if (clip.batchId !== batchId || clip.id !== clipId) throw new Error("Clip does not belong to this batch");
  const batch = await getBatch(batchId, root);
  if (!batch?.batch.clipIds.includes(clipId)) throw new Error("Clip not found");
  const valid = ClipBriefSchema.parse(clip);
  await writeJsonAtomic(root, clipFile(root, batchId, clipId), valid);
  const updatedBatch = { ...batch.batch, updatedAt: new Date().toISOString() };
  await writeJsonAtomic(root, batchFile(root, batchId), updatedBatch);
  return valid;
}
