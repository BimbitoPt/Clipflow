import path from "node:path";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { ambientChain, limiterChain, musicBedChain } from "../../shared/audio-mix";

const base = "local-assets/octane-archive/";
const shots: Record<string, { file: string; start: number; length: number }> = {
  night: { file: `${base}drift-night-pexels-29408199.mp4`, start: 6.0, length: 12.56 },
  aerial: { file: `${base}race-aerial-pexels-3774642.mp4`, start: 2.4, length: 15.68 },
  rain: { file: `${base}race-rain-pexels-12330982.mp4`, start: 5.5, length: 30.99 },
  supercar: { file: `${base}supercar-track-pexels-32068488.mp4`, start: 2.5, length: 8.54 },
  burnout: { file: `${base}burnout-vertical-pexels-26261436.mp4`, start: 0.2, length: 5.86 },
  vintage: { file: `${base}vintage-track-pexels-9767834.mp4`, start: 0.3, length: 5.46 },
};

// A 176.5 BPM estimate from the licensed track. Rotating 20/20/21-frame shots
// keeps each two-beat cut close to the track grid at 30 fps.
const framesPerShot = [20, 20, 21];
const edits = [
  { title: "AFTER DARK", hook: "LET IT SLIDE", issue: "NIGHT RUN", sequence: ["night", "supercar", "burnout", "night", "supercar", "night", "burnout", "supercar", "night", "burnout", "night", "supercar", "burnout", "night", "supercar"] },
  { title: "TRACK SPEC", hook: "THAT SPEC THOUGH", issue: "LIVERY / SPEED", sequence: ["supercar", "night", "rain", "supercar", "burnout", "night", "rain", "supercar", "night", "rain", "supercar", "vintage", "night", "rain", "supercar"] },
  { title: "SMOKE SHOW", hook: "DRIFT MODE ON", issue: "DRIFT CULTURE", sequence: ["burnout", "night", "burnout", "supercar", "night", "burnout", "night", "supercar", "burnout", "night", "burnout", "supercar", "night", "burnout", "night"] },
];
const music = `${base}audio/trap-electro-vibes-mixkit-126.mp3`;
const musicOffset = 9.42;

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let errorText = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { errorText += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(errorText || `ffmpeg exited ${code}`)));
  });
}

async function main() {
  const publicDir = path.join(process.cwd(), "public");
  const outputDir = path.join(publicDir, base, "edits");
  const font = "C\\:/Windows/Fonts/Impact.ttf";
  const totalFrames = framesPerShot.reduce((sum, frames) => sum + frames, 0) * 5;
  const duration = totalFrames / 30;
  await mkdir(outputDir, { recursive: true });

  for (const [index, edit] of edits.entries()) {
    const args = ["-hide_banner", "-loglevel", "error", "-y"];
    const filters: string[] = [];
    const segmentLabels: string[] = [];
    const occurrences: Record<string, number> = {};

    for (const [shotIndex, key] of edit.sequence.entries()) {
      const shot = shots[key];
      const occurrence = occurrences[key] ?? 0;
      occurrences[key] = occurrence + 1;
      const maxStart = shot.length - 1;
      const start = (shot.start + occurrence * 0.83) % maxStart;
      const frames = framesPerShot[shotIndex % framesPerShot.length];
      const shotSeconds = frames / 30;
      args.push("-ss", start.toFixed(3), "-t", shotSeconds.toFixed(6), "-i", path.join(publicDir, shot.file));

      const bg = `bg${shotIndex}`;
      const fg = `fg${shotIndex}`;
      const out = `v${shotIndex}`;
      segmentLabels.push(`[${out}]`);
      if (key === "burnout" || key === "night" || key === "supercar") {
        filters.push(`[${shotIndex}:v]trim=duration=${shotSeconds.toFixed(6)},setpts=PTS-STARTPTS,fps=30,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,eq=contrast=1.12:saturation=1.18:brightness=0.01,setsar=1,format=yuv420p[${out}]`);
      } else {
        filters.push(`[${shotIndex}:v]trim=duration=${shotSeconds.toFixed(6)},setpts=PTS-STARTPTS,fps=30,split=2[${bg}src][${fg}src]`);
        filters.push(`[${bg}src]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=18:1,eq=contrast=1.02:gamma=1.28:saturation=0.82:brightness=-0.05[${bg}]`);
        filters.push(`[${fg}src]scale=800:460:force_original_aspect_ratio=increase,crop=720:405:x='(iw-ow)/2+15*sin(8*PI*t)':y='(ih-oh)/2',eq=contrast=1.12:saturation=1.15:brightness=0.015,setsar=1[${fg}]`);
        filters.push(`[${bg}][${fg}]overlay=x=0:y=(H-h)/2:shortest=1,drawbox=x=0:y=(ih-405)/2:w=iw:h=405:color=0xFFFFFF44:t=2,setsar=1,format=yuv420p[${out}]`);
      }
    }

    const ambientInput = edit.sequence.length;
    const musicInput = ambientInput + 1;
    args.push("-stream_loop", "-1", "-i", path.join(publicDir, `${base}race-rain-pexels-12330982.mp4`));
    args.push("-stream_loop", "-1", "-ss", String(musicOffset), "-i", path.join(publicDir, music));

    const hook = edit.hook.replaceAll("'", "\\'");
    const flashTimes = Array.from({ length: 8 }, (_, i) => `between(t,${(i * 1.36).toFixed(2)},${(i * 1.36 + 0.055).toFixed(2)})`).join("+");
    filters.push(`${segmentLabels.join("")}concat=n=${edit.sequence.length}:v=1:a=0,drawbox=x=0:y=0:w=iw:h=ih:color=white@0.72:t=fill:enable='${flashTimes}',drawtext=fontfile='${font}':text='${hook}':fontcolor=white:fontsize=42:borderw=3:bordercolor=black@0.88:shadowcolor=black@0.8:shadowx=3:shadowy=4:x=(w-text_w)/2:y=82:enable='lt(t,0.95)',drawbox=x='(iw-112)/2':y=145:w=112:h=5:color=0xC9F05A:t=fill:enable='lt(t,0.85)'[outv]`);
    filters.push(`[${ambientInput}:a]${ambientChain()}[trackamb]`);
    filters.push(`[${musicInput}:a]${musicBedChain(duration)}[musicbed]`);
    filters.push(`[trackamb][musicbed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,${limiterChain()}[aout]`);

    args.push(
      "-filter_complex", filters.join(";"), "-map", "[outv]", "-map", "[aout]", "-t", duration.toFixed(3),
      "-c:v", "libx264", "-preset", "faster", "-crf", "24", "-maxrate", "3000k", "-bufsize", "6000k", "-profile:v", "high", "-level", "4.0",
      "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
      path.join(outputDir, `octane-${String(index + 1).padStart(2, "0")}.mp4`),
    );
    console.log(`Rendering ${edit.title} (${index + 1}/${edits.length})`);
    const videoPath = path.join(outputDir, `octane-${String(index + 1).padStart(2, "0")}.mp4`);
    await runFfmpeg(args);
    await runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-ss", "0.38", "-i", videoPath, "-frames:v", "1", "-q:v", "4", path.join(outputDir, `octane-${String(index + 1).padStart(2, "0")}-poster.jpg`)]);
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
