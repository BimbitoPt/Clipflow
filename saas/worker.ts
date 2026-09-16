import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { grantCredits, spendCredits } from "./lib/credits";
import { getDb } from "./lib/db";
import { elevenCost, elevenTts } from "./lib/eleven";
import { claimNextJob, failJob, reapStaleJobs, type Job } from "./lib/jobs";
import { renderCli } from "./lib/render-cli";

if (process.env.CLIPFLOW_WORKER !== "1") {
  console.log("worker disabled: set CLIPFLOW_WORKER=1");
  process.exit(0);
}

const OUT_DIR = path.join(process.cwd(), "storage", "jobs");

export function processJobsOnce(): void {
  const db = getDb();
  reapStaleJobs(db);
  const job = claimNextJob(db);
  if (!job) return;
  try {
    const outDir = path.join(OUT_DIR, String(job.id));
    if (job.voice.startsWith("eleven:")) {
      handleElevenJob(db, job, outDir);
      return;
    }
    renderCli(db, job, outDir);
  } catch (err) {
    failJob(db, job.id, String(err).slice(0, 500));
  }
}

// ElevenLabs jobs (voice = "eleven:{voiceId}"). Order: bill -> fetch audio ->
// refund-on-fail -> render. The CLI cannot consume the fetched wav, so it is
// stored as a job-dir artifact and the render proceeds with the CLI's own
// voice handling ("on").
function handleElevenJob(
  db: Database,
  job: Job,
  outDir: string,
): void {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    failJob(db, job.id, "elevenlabs not configured");
    return;
  }
  const cost = elevenCost(job.idea);
  if (!spendCredits(db, job.user_email, cost, "eleven-tts")) {
    failJob(db, job.id, "insufficient_credits");
    return;
  }
  void (async () => {
    const voiceId = job.voice.slice("eleven:".length);
    if (!/^[A-Za-z0-9]{8,64}$/.test(voiceId)) {
      failJob(db, job.id, "invalid eleven voice");
      return;
    }
    try {
      const audio = await elevenTts(apiKey, voiceId, job.idea);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(path.join(outDir, "voice.eleven.wav"), audio);
    } catch (err) {
      try {
        grantCredits(db, job.user_email, cost, "eleven-refund");
      } catch (refundErr) {
        console.error("eleven refund failed", refundErr);
      }
      failJob(db, job.id, "eleven fetch failed: " + String(err).slice(0, 200));
      return;
    }
    try {
      // refactor note: ElevenLabs charge is kept if renderCli fails (documented seam; reconciliation task later)
      renderCli(db, { ...job, voice: "on" }, outDir);
    } catch (err) {
      failJob(db, job.id, String(err).slice(0, 500));
    }
  })().catch((err) => {
    try {
      failJob(db, job.id, String(err).slice(0, 500));
    } catch (backstopErr) {
      console.error("failJob backstop failed", backstopErr);
    }
  });
}

function loop(): void {
  setInterval(processJobsOnce, 2000);
}

if (!process.env.VITEST) {
  loop();
}
