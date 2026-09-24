import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { completeJob, failJob, type Job } from "./jobs";
import { renderCoverCli } from "./cover-cli";

const RENDER_TIMEOUT_MS = 600_000;

function clipflowExeName(): string {
  return process.platform === "win32" ? "clipflow.exe" : "clipflow";
}

export function resolveClipflowCli(): string {
  if (process.env.CLIPFLOW_CLI) return process.env.CLIPFLOW_CLI;
  const exe = clipflowExeName();
  const cwd = process.cwd();
  for (const root of [cwd, path.join(cwd, "..")]) {
    const candidate = path.join(root, "native", "target", "release", exe);
    if (existsSync(candidate)) return candidate;
  }
  return path.join(cwd, "native", "target", "release", exe);
}

export function renderCli(db: Database, job: Job, outDir: string): void {
  const cli = resolveClipflowCli();
  const models = path.join(
    path.resolve(cli, "..", "..", "..", ".."),
    "public",
    "models",
  );
  mkdirSync(outDir, { recursive: true });

  const result = spawnSync(
    cli,
    [
      "render",
      "--idea",
      job.idea,
      "--voice",
      job.voice || "auto",
      "--out",
      outDir,
      "--models",
      models,
    ],
    { timeout: RENDER_TIMEOUT_MS, encoding: "utf8" },
  );

  if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    failJob(db, job.id, "render timeout");
    return;
  }

  const stdoutLines = (result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  const stderrLines = (result.stderr || "").trim().split(/\r?\n/).filter(Boolean);
  const mp4Paths = stdoutLines.filter((line) => line.endsWith(".mp4"));

  if (result.status !== 0 || mp4Paths.length === 0) {
    const tail = stderrLines.slice(-20).join("\n").slice(0, 500);
    failJob(
      db,
      job.id,
      `render failed (exit ${result.status ?? "signal"})\n${tail}`,
    );
    return;
  }

  const mp4Path = mp4Paths[mp4Paths.length - 1];
  completeJob(db, job.id, mp4Path);

  // Cover is additive: a cover failure must never fail the job.
  try {
    renderCoverCli(mp4Path, outDir, job.idea);
  } catch (err) {
    console.warn(`[cover] failed: ${String(err).slice(0, 200)}`);
  }
}
