import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getBatch } from "../src/lib/batch-store";

const run = promisify(execFile);

// Perceptual QA for voice word-timings: checks the stored spans against the
// real audio energy, then the rendered MP4 against the clip contract. These
// are sanity gates (catches seconds-off drift, silent-gap spans, broken
// media), not lab metrology — the human still watches the MP4.

const batchId = "batch-3329024d-d228-4a1a-b2dc-5b3110fca943";

type WordTiming = { word: string; start: number; end: number };

async function pcm(pathname: string): Promise<{ samples: Float32Array; rate: number }> {
  const rate = 24000;
  const { stdout } = await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", pathname, "-ac", "1", "-ar", String(rate), "-f", "s16le", "-"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  const samples = new Float32Array(stdout.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = stdout.readInt16LE(i * 2) / 32768;
  return { samples, rate };
}

function rmsWindows(samples: Float32Array, rate: number, windowSeconds = 0.01): Float32Array {
  const size = Math.max(1, Math.round(rate * windowSeconds));
  const out = new Float32Array(Math.ceil(samples.length / size));
  for (let w = 0; w < out.length; w++) {
    let sum = 0;
    for (let i = w * size; i < Math.min(samples.length, (w + 1) * size); i++) sum += samples[i] * samples[i];
    out[w] = Math.sqrt(sum / size);
  }
  return out;
}

function mean(windows: Float32Array, windowSeconds: number, from: number, to: number): number {
  const perSecond = 1 / windowSeconds;
  const a = Math.max(0, Math.floor(from * perSecond));
  const b = Math.min(windows.length, Math.ceil(to * perSecond));
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += windows[i];
  return sum / (b - a);
}

function checkTimings(timings: WordTiming[], audio: { samples: Float32Array; rate: number }): { pass: boolean; report: string[] } {
  const report: string[] = [];
  const windowSeconds = 0.01;
  const windows = rmsWindows(audio.samples, audio.rate, windowSeconds);
  const duration = audio.samples.length / audio.rate;
  const globalMean = mean(windows, windowSeconds, 0, duration);
  const peak = windows.reduce((max, value) => Math.max(max, value), 0);

  // m3: monotonic, in-bounds spans
  let prevEnd = 0;
  let monotonic = true;
  for (const timing of timings) {
    if (timing.start < prevEnd - 0.03 || timing.end <= timing.start || timing.end > duration + 0.05) { monotonic = false; break; }
    prevEnd = timing.end;
  }
  report.push(`spans monotonic & inside audio: ${monotonic ? "PASS" : "FAIL"} (${timings.length} words, ${duration.toFixed(2)}s audio)`);

  // m1: first word near the first energy onset
  const onsetThreshold = Math.max(globalMean * 2, peak * 0.08);
  let onset = 0;
  for (let w = 0; w < windows.length; w++) if (windows[w] > onsetThreshold) { onset = w * windowSeconds; break; }
  const firstStart = timings[0]?.start ?? 99;
  const onsetGap = Math.abs(firstStart - onset);
  report.push(`first word vs first energy onset: ${onsetGap <= 0.35 ? "PASS" : "FAIL"} (word ${firstStart.toFixed(2)}s, onset ${onset.toFixed(2)}s, gap ${onsetGap.toFixed(2)}s)`);

  // m2: each word span sits on audible speech
  let audible = 0;
  const quiet: string[] = [];
  for (const timing of timings) {
    const spanRms = mean(windows, windowSeconds, timing.start, timing.end);
    if (spanRms > globalMean * 0.15) audible += 1;
    else quiet.push(`${timing.word}@${timing.start.toFixed(2)}`);
  }
  const audibleShare = audible / Math.max(1, timings.length);
  report.push(`word spans on audible speech: ${audibleShare >= 0.85 ? "PASS" : "FAIL"} (${audible}/${timings.length}${quiet.length ? `; quiet: ${quiet.slice(0, 6).join(", ")}` : ""})`);

  // m4: last word ends near the end of the audio (Kokoro trailing silence)
  const lastEnd = timings.at(-1)?.end ?? 0;
  const tail = duration - lastEnd;
  report.push(`trailing silence after last word: ${tail >= -0.05 && tail <= 1.4 ? "PASS" : "FAIL"} (${tail.toFixed(2)}s)`);

  return { pass: monotonic && onsetGap <= 0.35 && audibleShare >= 0.85 && tail >= -0.05 && tail <= 1.4, report };
}

async function main() {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Trend batch not found");
  const qaDir = path.join(process.cwd(), "exports", "trend-qa");
  await mkdir(qaDir, { recursive: true });
  let failed = false;
  for (const clip of batch.clips.filter((item) => ["Shorts Series: make episode one", "AI Search: the website basics"].includes(item.concept))) {
    console.log(`\n=== ${clip.brandId} · ${clip.concept} (${clip.id})`);
    if (!clip.voiceover.audioPath || !clip.voiceover.wordTimings.length) throw new Error(`${clip.id}: no voiceover`);
    const audioPath = path.join(process.cwd(), "public", clip.voiceover.audioPath);
    const audio = await pcm(audioPath);
    const { pass, report } = checkTimings(clip.voiceover.wordTimings, audio);
    for (const line of report) console.log(`  ${line}`);
    if (!pass) failed = true;

    if (clip.status === "rendered" && clip.outputPath) {
      const file = path.join(process.cwd(), clip.outputPath);
      const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height", "-of", "json", file])).stdout);
      const video = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
      const sound = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "audio");
      const duration = Number(probe.format.duration);
      const mediaOk = video?.width === 1080 && video?.height === 1920 && video?.codec_name === "h264" && sound?.codec_name === "aac" && Math.abs(duration - clip.durationSeconds) <= 0.35;
      console.log(`  rendered MP4: ${mediaOk ? "PASS" : "FAIL"} (${duration.toFixed(2)}s vs clip ${clip.durationSeconds}s, ${video?.codec_name}/${sound?.codec_name} ${video?.width}x${video?.height})`);
      if (!mediaOk) failed = true;
      const contact = path.join(qaDir, `${clip.brandId}-contact.png`);
      await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-vf", "fps=1/2,scale=270:-1,tile=4x3", "-frames:v", "1", contact]);
      console.log(`  contact sheet: ${path.relative(process.cwd(), contact).replace(/\\/g, "/")}`);
      console.log(`  watch: ${path.relative(process.cwd(), file).replace(/\\/g, "/")}`);
    } else {
      console.log(`  rendered MP4: PENDING (status ${clip.status})`);
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
