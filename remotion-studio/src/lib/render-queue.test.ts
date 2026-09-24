import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBatch, getBatch, updateClip, type CreateBrief } from "./batch-store";
import { approveClip } from "./clip-state";
import { enqueueApproved, getAllJobs, getRenderStatus, queuedJob, recoverInterruptedJobs, setJobProgress, setJobResult } from "./render-queue";

let root: string | undefined;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = undefined; });

function makeBriefs(): CreateBrief[] {
  return Array.from({ length: 10 }, (_, index) => ({ brandId: "clipflow", concept: `Concept ${index}`, hook: `Hook ${index}`, keyMessage: `Message ${index}` }));
}

describe("durable render queue", () => {
  it("queues only approved clips, serializes work, and isolates a failed render", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "clipflow-queue-"));
    const created = await createBatch("Queue test", makeBriefs(), root);
    await updateClip(created.batch.id, created.clips[0].id, approveClip(created.clips[0]), root);
    await updateClip(created.batch.id, created.clips[1].id, approveClip(created.clips[1]), root);
    const queued = await enqueueApproved(created.batch.id, root);
    expect(queued).toHaveLength(2);
    const active = await queuedJob(root);
    expect(active?.status).toBe("running");
    await setJobProgress(active!.id, .42, root);
    await setJobResult(active!, { ok: false, error: "fixture render failed" }, root);
    const status = await getRenderStatus(created.batch.id, active!.clipId, root);
    expect(status.clip?.status).toBe("failed");
    expect(status.job?.status).toBe("failed");
    expect(status.job?.progress).toBe(.42);
    expect(await queuedJob(root)).toMatchObject({ status: "running", clipId: queued[1].clipId });
    expect((await getAllJobs(root)).filter((job) => job.status === "queued")).toHaveLength(0);
  });

  it("recovers an interrupted render and allows explicit retry approval", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "clipflow-queue-"));
    const created = await createBatch("Recovery test", makeBriefs(), root);
    await updateClip(created.batch.id, created.clips[0].id, approveClip(created.clips[0]), root);
    await enqueueApproved(created.batch.id, root);
    const active = await queuedJob(root);
    await recoverInterruptedJobs(root);
    expect((await getAllJobs(root))[0]).toMatchObject({ status: "queued", progress: 0 });
    const recoveredBatch = await getBatch(created.batch.id, root);
    const recoveredClip = recoveredBatch!.clips[0];
    expect(recoveredClip.status).toBe("approved");
    expect((await queuedJob(root))?.id).toBe(active!.id);
  });

  it("retries a failed clip only after it is explicitly approved again", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "clipflow-queue-"));
    const created = await createBatch("Retry test", makeBriefs(), root);
    await updateClip(created.batch.id, created.clips[0].id, approveClip(created.clips[0]), root);
    await enqueueApproved(created.batch.id, root);
    const active = await queuedJob(root);
    await setJobResult(active!, { ok: false, error: "fixture render failed" }, root);
    const failedBatch = await getBatch(created.batch.id, root);
    await updateClip(created.batch.id, created.clips[0].id, approveClip(failedBatch!.clips[0]), root);
    const retry = await enqueueApproved(created.batch.id, root);
    expect(retry).toHaveLength(1);
    expect(retry[0].id).not.toBe(active!.id);
  });

  it("publishes a successful artifact only after the job completes", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "clipflow-queue-"));
    const created = await createBatch("Success test", makeBriefs(), root);
    await updateClip(created.batch.id, created.clips[0].id, approveClip(created.clips[0]), root);
    await enqueueApproved(created.batch.id, root);
    const active = await queuedJob(root);
    await setJobResult(active!, { ok: true, outputPath: "exports/batches/test/video.mp4", coverPath: "exports/batches/test/cover.png" }, root);
    const status = await getRenderStatus(created.batch.id, active!.clipId, root);
    expect(status.clip).toMatchObject({ status: "rendered", progress: 1, outputPath: "exports/batches/test/video.mp4", coverPath: "exports/batches/test/cover.png" });
    expect(status.job?.status).toBe("complete");
  });
});
