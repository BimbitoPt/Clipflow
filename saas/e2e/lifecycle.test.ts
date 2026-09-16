import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { setSubscription, tierFor } from "../lib/billing";
import { canRender, quotaFor, recordRender } from "../lib/credits";
import { enqueue, claimNextJob } from "../lib/jobs";
import { freshTestDb, isWaitlisted, joinWaitlist } from "../lib/waitlist";

vi.mock("../lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/db")>();
  return { ...actual, getDb: () => db };
});

vi.mock("../lib/render-cli", async () => {
  const jobs = await import("../lib/jobs");
  return {
    renderCli: (database: unknown, job: { id: number }, outDir: string) => {
      jobs.completeJob(database as Parameters<typeof jobs.completeJob>[0], job.id, `${outDir}fake.mp4`);
    },
  };
});

let db: Database.Database;

describe("e2e lifecycle", () => {
  beforeEach(() => {
    db = freshTestDb();
  });

  it("walks waitlist, billing, quota, worker, and stale reaper", async () => {
    expect(joinWaitlist(db, "zoe@clip.co")).toEqual({ ok: true });
    expect(joinWaitlist(db, "zoe@clip.co")).toEqual({ ok: false, reason: "duplicate" });
    expect(isWaitlisted(db, "zoe@clip.co")).toBe(true);

    setSubscription(db, "zoe@clip.co", "creator", "active");
    expect(tierFor(db, "zoe@clip.co")).toBe("creator");

    expect(canRender(db, "zoe@clip.co", "creator")).toBe(true);
    const quota = quotaFor("creator");
    expect(quota).toBe(60);
    const ids: number[] = [];
    for (let i = 0; i < quota; i++) {
      expect(canRender(db, "zoe@clip.co", "creator")).toBe(true);
      ids.push(enqueue(db, "zoe@clip.co", `idea ${i + 1}`));
      recordRender(db, "zoe@clip.co");
    }
    expect(canRender(db, "zoe@clip.co", "creator")).toBe(false);

    process.env.CLIPFLOW_WORKER = "1";
    const { processJobsOnce } = await import("../worker");
    for (let i = 0; i < ids.length; i++) processJobsOnce();
    const rows = db.prepare("SELECT id, status, out_path FROM jobs ORDER BY id").all() as Array<Pick<{ id: number; status: string; out_path: string | null }, "id" | "status" | "out_path">>;
    expect(rows.map((r) => r.id)).toEqual(ids);
    for (const row of rows) {
      expect(row.status).toBe("done");
      expect(row.out_path?.endsWith(".mp4")).toBe(true);
    }

    const staleId = enqueue(db, "zoe@clip.co", "stale idea");
    const claimed = claimNextJob(db);
    expect(claimed?.id).toBe(staleId);
    db.prepare("UPDATE jobs SET updated_at = datetime('now', '-20 minutes') WHERE id = ?").run(staleId);

    const freshId = enqueue(db, "zoe@clip.co", "fresh idea");
    const freshClaimed = claimNextJob(db);
    expect(freshClaimed?.id).toBe(freshId);
    processJobsOnce();
    const reaped = db.prepare("SELECT status, error FROM jobs WHERE id = ?").get(staleId) as { status: string; error: string };
    expect(reaped.status).toBe("failed");
    expect(reaped.error).toContain("restart or timeout");
    const fresh = db.prepare("SELECT status FROM jobs WHERE id = ?").get(freshId) as { status: string };
    expect(fresh.status).toBe("running");
  });
});
