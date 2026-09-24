#!/usr/bin/env node
// Fetch free-license vertical clips from Pexels and normalize them into
// public/broll/clips/ for the mixed pool. Usage:
//   node scripts/fetch-pexels-clips.mjs <PEXELS_API_KEY>
// Gets one clip per query (best vertical match among the first page), trims
// to <=6s, cover-crops to 720x1280@30, drops audio, H.264+faststart.
// Pexels license allows free commercial use without attribution.
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const KEY = process.argv[2] ?? process.env.PEXELS_API_KEY;
if (!KEY) {
  console.error("usage: node scripts/fetch-pexels-clips.mjs <Pexels API key>  (free: pexels.com/api)");
  process.exit(1);
}

// [stem, search query] - tech-first per the no-visual-slop rule.
const QUERIES = [
  ["typing", "typing code on laptop"],
  ["typing", "programming terminal closeup"],
  ["typing", "software development screen"],
  ["analyze", "dashboard charts screen"],
  ["analyze", "financial data monitor"],
  ["analyze", "website pages on laptop"],
  ["mobile", "hands using smartphone vertical"],
  ["mobile", "phone app close up hand"],
  ["mobile", "laptop keyboard typing"],
  ["office", "creative office desk setup"],
  ["office", "camera tripod filming"],
  ["urban", "city night vertical"],
  ["urban", "skyline dusk vertical"],
  ["flow", "coffee shop laptop morning"],
  ["flow", "notebook sketch desk"],
  // Batch 2 (2026-09-17 evening): broaden the pool so renders vary.
  ["ai", "artificial intelligence robot"],
  ["ai", "chatbot conversation screen"],
  ["ai", "technology abstract digital"],
  ["focus", "developer thinking thoughtfully"],
  ["focus", "person working late laptop"],
  ["night", "city traffic timelapse vertical"],
  ["night", "metro subway ride vertical"],
  ["macro", "mechanical keyboard macro"],
  ["macro", "mouse cursor clicking closeup"],
  ["team", "startup team meeting",
  ],
  ["team", "colleagues working together screen"],
  ["growth", "sales growth presentation screen"],
  ["growth", "marketing strategy whiteboard"],
  ["abstract", "abstract blue gradient motion"],
  ["abstract", "abstract data particles motion"],
];

const OUT_DIR = path.resolve("public", "broll", "clips");
mkdirSync(OUT_DIR, { recursive: true });

async function search(query) {
  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=12`,
    { headers: { Authorization: KEY } },
  );
  if (!res.ok) throw new Error(`pexels responded ${res.status}`);
  return res.json();
}

function pickVertical(videos) {
  for (const v of videos) {
    if (v.duration < 4 || v.duration > 20) continue;
    const files = v.video_files.filter(
      (f) => f.height >= f.width && f.height >= 1280 && f.width >= 720,
    );
    const best = files.sort((a, b) => a.height - b.height)[0];
    if (best) return { v, file: best };
  }
  return null;
}

let fetched = 0;
let skipped = 0;
let idx = 1;
for (const [stem, query] of QUERIES) {
  const dest = path.join(OUT_DIR, `${stem}-v${String(idx).padStart(2, "0")}.mp4`);
  if (existsSync(dest)) {
    console.log(`have  ${dest}`);
    idx++;
    fetched++;
    continue;
  }
  const data = await search(query);
  const hit = pickVertical(data.videos ?? []);
  if (!hit) {
    console.log(`skip  no vertical match: ${query}`);
    continue;
  }
  const tmp = dest.replace(/\.mp4$/, ".src.mp4");
  const res = await fetch(hit.file.link);
  if (!res.ok) {
    console.log(`skip  download ${res.status}: ${query}`);
    continue;
  }
  const tmpFile = path.resolve("public", "broll", "clips", path.basename(tmp));
  await import("node:fs").then(async (fs) =>
    fs.writeFileSync(tmpFile, Buffer.from(await res.arrayBuffer())),
  );
  execFileSync(
    ffmpegPath,
    ["-y", "-i", tmpFile,
     "-t", "6", "-an",
     "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30",
     "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart",
     dest],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  unlinkSync(tmpFile);
  console.log(`fetched ${path.basename(dest)} (pexels ${hit.v.id})`);
  fetched++;
  idx++;
}

console.log(`done: ${fetched} clips in ${OUT_DIR}`);
