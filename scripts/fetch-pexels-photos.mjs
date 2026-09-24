#!/usr/bin/env node
// Fetch free-license vertical photo b-roll from Pexels into public/broll/pexels/.
// Usage: node scripts/fetch-pexels-photos.mjs <PEXELS_API_KEY>
// One photo per query, large vertical, JPG. Pexels license: free commercial use.
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const KEY = process.argv[2] ?? process.env.PEXELS_API_KEY;
if (!KEY) {
  console.error("usage: node scripts/fetch-pexels-photos.mjs <Pexels API key>");
  process.exit(1);
}

const QUERIES = [
  ["code", "programming code on screen"],
  ["code", "developer laptop closeup"],
  ["code", "terminal command line"],
  ["screen", "analytics dashboard"],
  ["screen", "charts graphs monitor"],
  ["screen", "ui design on screen"],
  ["device", "hands on smartphone"],
  ["device", "laptop keyboard typing"],
  ["device", "phone screen closeup"],
  ["desk", "minimal desk setup dark"],
  ["desk", "workspace monitor keyboard"],
  ["desk", "office desk night lights"],
  ["city", "city skyline night vertical"],
  ["city", "skyscrapers dusk vertical"],
  ["notebook", "notebook sketch desk"],
  ["server", "data center servers"],
  ["meeting", "business conversation laptop"],
  ["coffee", "coffee cup laptop desk"],
];

const OUT_DIR = path.resolve("public", "broll", "pexels");
mkdirSync(OUT_DIR, { recursive: true });

let fetched = 0;
let idx = 1;
for (const [stem, query] of QUERIES) {
  const dest = path.join(OUT_DIR, `${stem}-p${String(idx).padStart(2, "0")}.jpg`);
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`,
    { headers: { Authorization: KEY } },
  );
  if (!res.ok) {
    console.log(`skip  search ${res.status}: ${query}`);
    continue;
  }
  const data = await res.json();
  const photo = (data.photos ?? []).find((p) => p.height >= p.width && p.height >= 1280);
  if (!photo) {
    console.log(`skip  no vertical: ${query}`);
    continue;
  }
  const big = photo.src?.large2x ?? photo.src?.large ?? photo.src?.original;
  const img = await fetch(big);
  if (!img.ok) {
    console.log(`skip  download ${img.status}: ${query}`);
    continue;
  }
  writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
  console.log(`fetched ${path.basename(dest)} (pexels ${photo.id})`);
  fetched++;
  idx++;
}

console.log(`done: ${fetched} photos in ${OUT_DIR}`);
