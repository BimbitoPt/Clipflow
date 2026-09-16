import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "./lib/db";
import { claimNextJob, completeJob, failJob } from "./lib/jobs";

if (process.env.CLIPFLOW_WORKER !== "1") {
  console.log("worker disabled: set CLIPFLOW_WORKER=1");
  process.exit(0);
}

const OUT_DIR = path.join(process.cwd(), "storage", "jobs");

export function processJobsOnce(): void {
  const db = getDb();
  const job = claimNextJob(db);
  if (!job) return;
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, `${job.id}.txt`);
    writeFileSync(outPath, job.idea, "utf8");
    completeJob(db, job.id, outPath);
  } catch (err) {
    failJob(db, job.id, String(err).slice(0, 500));
  }
}

function loop(): void {
  setInterval(processJobsOnce, 2000);
}

loop();
