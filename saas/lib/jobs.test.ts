import { describe, expect, it } from "vitest";
import { freshTestDb } from "./waitlist";
import { enqueue, claimNextJob, completeJob, failJob, reapStaleJobs } from "./jobs";
import { canRender, recordRender, quotaFor } from "./credits";

describe("jobs", () => {
  it("enqueue inserts a queued job and returns its id", () => {
    const db = freshTestDb();
    const id = enqueue(db, "a@b.co", "one idea", "auto");
    expect(id).toBeGreaterThan(0);
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as any;
    expect(job.status).toBe("queued");
    expect(job.idea).toBe("one idea");
  });
  it("claimNextJob is atomic: one claim per call, FIFO order", () => {
    const db = freshTestDb();
    const id1 = enqueue(db, "a@b.co", "first", "auto");
    const id2 = enqueue(db, "a@b.co", "second", "auto");
    const j1 = claimNextJob(db);
    expect(j1 && j1.id).toBe(id1);
    expect(j1 && j1.status).toBe("running");
    const j2 = claimNextJob(db);
    expect(j2 && j2.id).toBe(id2);
    expect(claimNextJob(db)).toBeNull();
  });
  it("failJob records an error, completeJob records out_path", () => {
    const db = freshTestDb();
    const id = enqueue(db, "a@b.co", "idea", "auto");
    claimNextJob(db);
    failJob(db, id, "boom");
    const failed = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as any;
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("boom");
    const id2 = enqueue(db, "b@b.co", "idea2", "auto");
    claimNextJob(db);
    completeJob(db, id2, "out/x.mp4");
    const done = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id2) as any;
    expect(done.status).toBe("done");
    expect(done.out_path).toBe("out/x.mp4");
  });
  it("reapStaleJobs fails stale running jobs but leaves fresh ones running", () => {
    const db = freshTestDb();
    const staleId = enqueue(db, "a@b.co", "stale", "auto");
    const freshId = enqueue(db, "a@b.co", "fresh", "auto");
    claimNextJob(db);
    claimNextJob(db);
    db.prepare(
      "UPDATE jobs SET updated_at = datetime('now', '-20 minutes') WHERE id = ?",
    ).run(staleId);
    reapStaleJobs(db, 10);
    const stale = db.prepare("SELECT * FROM jobs WHERE id = ?").get(staleId) as any;
    expect(stale.status).toBe("failed");
    expect(stale.error).toContain("restart or timeout");
    const fresh = db.prepare("SELECT * FROM jobs WHERE id = ?").get(freshId) as any;
    expect(fresh.status).toBe("running");
  });
});
