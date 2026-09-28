import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { listBatches } from "../src/lib/batch-store";

const run = promisify(execFile);
const batchName = "Proof on screen · Clipflow + MStudio · 10-episode pilot";

async function main() {
  const batch = (await listBatches()).find(({ batch }) => batch.name === batchName);
  if (!batch || batch.clips.length !== 10) throw new Error("Expected the ten-clip proof batch");
  const qaDir = path.join(process.cwd(), "exports", "proof-series-qa");
  await mkdir(qaDir, { recursive: true });
  const report = [];
  for (const clip of batch.clips) {
    if (clip.status !== "rendered" || !clip.outputPath || !clip.coverPath) throw new Error(`${clip.concept}: ${clip.status}`);
    const file = path.join(process.cwd(), clip.outputPath);
    const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height", "-of", "json", file])).stdout);
    const video = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
    const audio = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "audio");
    const duration = Number(probe.format.duration);
    if (video?.width !== 1080 || video?.height !== 1920 || video?.codec_name !== "h264" || audio?.codec_name !== "aac" || Math.abs(duration - clip.durationSeconds) > .2) throw new Error(`${clip.concept}: invalid media ${JSON.stringify(probe)}`);
    const episode = clip.concept.match(/\s\/\s(\d+)\s\//)?.[1];
    const contact = path.join(qaDir, `${clip.brandId}-${episode}.png`);
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-vf", "fps=1/2,scale=270:-1,tile=4x3", "-frames:v", "1", contact]);
    report.push({ concept: clip.concept, duration, videoCodec: video.codec_name, audioCodec: audio.codec_name, dimensions: `${video.width}x${video.height}`, contactSheet: path.relative(process.cwd(), contact).replace(/\\/g, "/") });
    console.log(`PASS ${clip.concept} (${duration.toFixed(1)}s)`);
  }
  await writeFile(path.join(qaDir, "report.json"), `${JSON.stringify({ checkedAt: new Date().toISOString(), clips: report }, null, 2)}\n`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
