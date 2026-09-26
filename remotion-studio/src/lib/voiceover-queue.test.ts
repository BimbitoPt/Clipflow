import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBatch, updateClip } from "./batch-store";
import { completeVoiceoverJob, enqueueMissingVoiceovers, getVoiceoverJob, isVoiceoverJobStale, queuedVoiceoverJob, recordVoiceoverResult, recoverVoiceoverJobs } from "./voiceover-queue";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("durable local voiceover queue", () => {
  it("marks jobs stale after a missing worker or a stalled inference", () => {
    const base = { id: "job", batchId: "batch", total: 10, processed: 0, generated: 0, skipped: 0, failed: 0, error: null, errors: [], processedClipIds: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
    expect(isVoiceoverJobStale({ ...base, status: "queued" }, 90_001)).toBe(true);
    expect(isVoiceoverJobStale({ ...base, status: "running" }, 10 * 60_000 + 1)).toBe(true);
    expect(isVoiceoverJobStale({ ...base, status: "complete" }, 99 * 60_000)).toBe(false);
  });

  it("queues one batch, records per-clip progress, and resumes interrupted work", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clipflow-voice-queue-")); roots.push(root);
    const created = await createBatch("Queue test", Array.from({ length: 10 }, (_, index) => ({ brandId: "clipflow", concept: `Clip ${index}`, hook: `Hook ${index}`, keyMessage: "Message", cta: "Start" })), root);
    const queued = await enqueueMissingVoiceovers(created.batch.id, root);
    expect(queued).toMatchObject({ status: "queued", total: 10, processed: 0 });
    expect((await enqueueMissingVoiceovers(created.batch.id, root)).id).toBe(queued.id);

    const active = await queuedVoiceoverJob(root);
    expect(active?.status).toBe("running");
    await recordVoiceoverResult(queued.id, { clipId: created.clips[0].id, status: "generated" }, root);
    expect(await getVoiceoverJob(created.batch.id, root)).toMatchObject({ processed: 1, generated: 1 });
    await recoverVoiceoverJobs(root);
    expect(await getVoiceoverJob(created.batch.id, root)).toMatchObject({ status: "queued", processed: 1 });
    const resumed = await queuedVoiceoverJob(root);
    await recordVoiceoverResult(queued.id, { clipId: created.clips[1].id, status: "failed", error: "Narration is too long" }, root);
    await completeVoiceoverJob(queued.id, root);
    expect(await getVoiceoverJob(created.batch.id, root)).toMatchObject({ status: "complete", processed: 10, generated: 1, failed: 1 });
    expect(resumed?.processedClipIds).toEqual([created.clips[0].id]);
  });

  it("refuses to queue once all clips already have narration", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clipflow-voice-ready-")); roots.push(root);
    const created = await createBatch("Ready test", Array.from({ length: 10 }, (_, index) => ({ brandId: "clipflow", concept: `Clip ${index}`, hook: `Hook ${index}`, keyMessage: "Message" })), root);
    for (const clip of created.clips) await updateClip(created.batch.id, clip.id, { ...clip, voiceover: { ...clip.voiceover, audioPath: "local-assets/voiceovers/ready.wav" } }, root);
    await expect(enqueueMissingVoiceovers(created.batch.id, root)).rejects.toThrow(/Every clip already has a voiceover/);
  });
});
