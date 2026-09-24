import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const FILES = [
  ...readdirSync("public/broll").filter((f) => f.endsWith(".jpg")).map((f) => path.join("public", "broll", f)),
  ...readdirSync("public/broll/pexels").filter((f) => f.endsWith(".jpg")).map((f) => path.join("public", "broll", "pexels", f)),
  ...readdirSync("public/broll/clips").filter((f) => f.endsWith(".mp4")).map((f) => path.join("public", "broll", "clips", f)),
];

const TMP = path.join(process.cwd(), "bright-sample.pgm");

// First-frame mean luminance via tiny gray PGM (P5 header, values 0-255).
function measure(file, cb) {
  execFile(ffmpegPath, ["-hide_banner", "-y", "-ss", "0", "-i", file,
    "-vf", "scale=32:56,format=gray", "-frames:v", "1", TMP],
    () => {
      let avg = -1;
      try {
        const buf = readFileSync(TMP);
        // P5 header: "P5\n32 56\n255\n"
        const headerEnd = buf.indexOf(255) + 1;
        let sum = 0;
        let n = 0;
        for (let i = headerEnd; i < buf.length; i++) {
          sum += buf[i];
          n++;
        }
        avg = n ? sum / n : -1;
      } catch {}
      cb(avg);
    });
}

const rows = [];
let pending = FILES.length;
for (const f of FILES) {
  measure(f, (avg) => {
    rows.push([avg, f]);
    if (--pending === 0) {
      rows.sort((a, b) => b[0] - a[0]);
      for (const [avg, file] of rows) console.log(`${avg.toFixed(1).padStart(7)}  ${path.basename(file)}`);
    }
  });
}
