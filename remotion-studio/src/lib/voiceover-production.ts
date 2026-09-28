import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { WordTiming } from "./domain";

const exec = promisify(execFile);
type Generated = { audioPath: string; durationSeconds: number; wordTimings: WordTiming[]; generatedFor: string };

export async function normalizeVoiceover(generated: Generated, appRoot = process.cwd(), tempo = 1) {
  if (!Number.isFinite(tempo) || tempo < .7 || tempo > 1.5) throw new Error("Voice tempo must be between 0.7 and 1.5");
  const input = path.join(appRoot, "public", generated.audioPath);
  const output = input.replace(/\.wav$/i, `-t${Math.round(tempo * 100)}-lufs14.wav`);
  await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-af", `atempo=${tempo},loudnorm=I=-14:TP=-1.5:LRA=11`, output]);
  const sink = process.platform === "win32" ? "NUL" : "/dev/null";
  const measured = await exec("ffmpeg", ["-hide_banner", "-nostats", "-i", output, "-af", "ebur128=peak=true", "-f", "null", sink]);
  const matches = [...measured.stderr.matchAll(/I:\s*(-?\d+(?:\.\d+)?) LUFS/g)];
  const lufs = Number(matches.at(-1)?.[1]);
  if (!Number.isFinite(lufs) || Math.abs(lufs + 14) > 2) throw new Error(`Voice loudness ${lufs} LUFS is outside the production target`);
  return {
    ...generated,
    audioPath: path.relative(path.join(appRoot, "public"), output).replace(/\\/g, "/"),
    durationSeconds: generated.durationSeconds / tempo,
    wordTimings: generated.wordTimings.map((word) => ({ ...word, start: word.start / tempo, end: word.end / tempo })),
    measuredLufs: lufs,
  };
}
