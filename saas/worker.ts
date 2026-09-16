import path from "node:path";
import { getDb } from "./lib/db";
import { claimNextJob, failJob } from "./lib/jobs";
import { renderCli } from "./lib/render-cli";

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
    const outDir = path.join(OUT_DIR, String(job.id));
    renderCli(db, job, outDir);
  } catch (err) {
    failJob(db, job.id, String(err).slice(0, 500));
  }
}

function loop(): void {
  setInterval(processJobsOnce, 2000);
}

if (!process.env.VITEST) {
  loop();
}
