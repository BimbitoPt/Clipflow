import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getBatch } from "../src/lib/batch-store";

const run = promisify(execFile);

// Advisory scene QA: sample frames from each rendered trend clip and ask
// Moondream the fixed rubric (text cut off? visually broken?). Findings are
// reported, never auto-fixed; environment problems (no venv, model download
// failure) degrade to a skip - this gate can only ever add eyes, not block.
//
// Requires the QA venv once (pip's torch wheel is CPU-only on Windows, and
// moondream2 via Kestrel is CUDA-only, so the CUDA index is mandatory):
//   py -3.11 -m venv data/qa-venv
//   data\qa-venv\Scripts\python.exe -m pip install moondream pillow
//   data\qa-venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu128
// Override the interpreter with CLIPFLOW_QA_PYTHON, force a device with
// CLIPFLOW_QA_DEVICE.
//
// Timing: kestrel-kernels only ships fused kernels for sm80+ — on Turing
// (sm75, RTX 2060) rotary embedding falls back to PyTorch, so eager decode
// runs ~2-3 min/query. Budget ~60-90 min for the full 16-query run.

const batchId = "batch-3329024d-d228-4a1a-b2dc-5b3110fca943";
const concepts = ["Shorts Series: make episode one", "AI Search: the website basics"];
const frameFractions = [0.15, 0.4, 0.65, 0.9];
const questions = [
  "This is a frame from a vertical marketing video. Is any text cut off at the frame edges, overlapping other elements, or unreadable? Answer using JSON with keys: text_issues (yes or no) and detail (short string).",
  "Does this frame look visually broken - missing or blank image areas, garbled graphics, misaligned panels? Answer using JSON with keys: layout_issues (yes or no) and detail (short string).",
];

type PyAnswer = { question: string; answer: string };
type PyItem = { id: string; answers: PyAnswer[] };

function flagged(answer: string): boolean {
  const keyHit = /"(?:text|layout)_issues"\s*:\s*"(yes|no)"/i.exec(answer);
  if (keyHit) return keyHit[1]!.toLowerCase() === "yes";
  const bareKey = /(?:text|layout)_issues[^a-z]{0,6}(yes)/i.exec(answer);
  if (bareKey) return true;
  // No parseable key: only trust an unambiguous yes with no negation nearby.
  return /\byes\b/i.test(answer) && !/\bno\b/i.test(answer);
}

async function main() {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Trend batch not found");
  const qaDir = path.join(process.cwd(), "exports", "trend-qa");
  const frameDir = path.join(qaDir, "frames");
  await mkdir(frameDir, { recursive: true });
  const python = process.env.CLIPFLOW_QA_PYTHON ?? path.join(process.cwd(), "data", "qa-venv", "Scripts", "python.exe");

  const clips = batch.clips.filter((clip) => concepts.includes(clip.concept));
  const items: Array<{ id: string; frame: string; clipLabel: string }> = [];
  for (const clip of clips) {
    if (clip.status !== "rendered" || !clip.outputPath) {
      console.log(`${clip.brandId}: scene QA skipped (status ${clip.status})`);
      continue;
    }
    const file = path.join(process.cwd(), clip.outputPath);
    const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", file])).stdout);
    const duration = Number(probe.format.duration);
    for (const [index, fraction] of frameFractions.entries()) {
      const frame = path.join(frameDir, `${clip.brandId}-${index}.jpg`);
      await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", (duration * fraction).toFixed(2), "-i", file, "-frames:v", "1", "-q:v", "3", frame]);
      items.push({ id: `${clip.brandId}@t=${(duration * fraction).toFixed(1)}`, frame, clipLabel: clip.brandId });
    }
  }
  if (!items.length) {
    console.log("scene QA: nothing to inspect");
    return;
  }

  const manifest = path.join(qaDir, "moondream-manifest.json");
  const byClip = new Map<string, { id: string; frame: string; questions: string[] }[]>();
  for (const item of items) {
    const list = byClip.get(item.clipLabel) ?? [];
    list.push({ id: item.id, frame: item.frame, questions });
    byClip.set(item.clipLabel, list);
  }

  let parsed: { items: PyItem[]; error: string | null };
  try {
    const device = process.env.CLIPFLOW_QA_DEVICE;
    const manifestItems = [...byClip.values()].flat();
    await writeFile(manifest, JSON.stringify({ model: "moondream2", ...(device ? { device } : {}), items: manifestItems }, null, 2));
    const { stdout } = await run(python, [path.join(process.cwd(), "scripts", "moondream_qa.py"), manifest], { maxBuffer: 32 * 1024 * 1024, timeout: 90 * 60 * 1000 });
    parsed = JSON.parse(stdout);
  } catch (error) {
    const detail = error instanceof Error ? `${error.message}\n${(error as NodeJS.ErrnoException & { stderr?: string }).stderr ?? ""}`.trim().split("\n").slice(0, 4).join(" | ") : String(error);
    console.log(`scene QA skipped: ${detail}`);
    return;
  }
  if (parsed.error) {
    console.log(`scene QA skipped: ${parsed.error}`);
    return;
  }
  const allAnswers = parsed.items.flatMap((item) => item.answers);
  if (allAnswers.length && allAnswers.every((entry) => entry.answer.startsWith("ERROR:"))) {
    console.log(`scene QA skipped: model returned only errors (${allAnswers[0]?.answer.slice(0, 120)})`);
    return;
  }

  let findings = 0;
  for (const [label, clipItems] of byClip) {
    const answers: PyAnswer[] = [];
    for (const item of clipItems) {
      const match = parsed.items.find((entry) => entry.id === item.id);
      answers.push(...(match?.answers ?? []));
    }
    const flags = answers.filter((entry) => flagged(entry.answer));
    findings += flags.length;
    await writeFile(path.join(qaDir, `${label}-scene-qa.json`), JSON.stringify({ answers, flags: flags.length }, null, 2));
    console.log(`\n=== ${label} scene QA: ${flags.length ? `${flags.length} flag(s)` : "clean"} (${answers.length} answers)`);
    for (const entry of answers) {
      const mark = flagged(entry.answer) ? "FLAG" : " ok ";
      console.log(`  [${mark}] ${entry.question.slice(0, 48)}… -> ${entry.answer.replace(/\s+/g, " ").slice(0, 140)}`);
    }
    console.log(`  report: ${path.relative(process.cwd(), path.join(qaDir, `${label}-scene-qa.json`)).replace(/\\/g, "/")}`);
  }
  if (findings) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
