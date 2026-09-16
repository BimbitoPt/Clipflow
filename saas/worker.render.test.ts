import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { enqueue } from "./lib/jobs";
import { getDb, resetDbForTests } from "./lib/db";
import { resolveClipflowCli } from "./lib/render-cli";

const cli = resolveClipflowCli();

describe.skipIf(!existsSync(cli))("worker renders via real CLI", () => {
  let jobId: number;

  beforeAll(async () => {
    process.env.CLIPFLOW_WORKER = "1";
    process.env.CLIPFLOW_DB = path.join(process.cwd(), "data", "worker-test.db");
    resetDbForTests();
    const db = getDb();
    jobId = enqueue(db, "t@t.co", "the fastest way to launch a product", "sapi");
    const { processJobsOnce } = await import("./worker");
    processJobsOnce();
  }, 900_000);

  it("marks the job done and writes a real mp4", () => {
    const db = getDb();
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as any;
    expect(job.status).toBe("done");
    expect(job.out_path.endsWith(".mp4")).toBe(true);
    expect(existsSync(job.out_path)).toBe(true);
    expect(statSync(job.out_path).size).toBeGreaterThan(100000);
  });
});
