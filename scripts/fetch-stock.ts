// Fetch real stock video into the local pool from Pexels + Pixabay (both free
// for commercial use). Downloads land in public/broll/fetched/ and the pool
// module (src/lib/broll-fetched.ts) is regenerated, so the app's curated
// pool grows with fetched clips — no runtime network, offline-safe.
//
//   npm run stock:fetch [-- --force]
//
// Keys: PEXELS_API_KEY / PIXABAY_API_KEY env vars, or stock-keys.local.json
// ("{"pexels": "...", "pixabay": "..."}" — gitignored via *.local). Without
// keys the script exits 0 and prints the plan: an unavailable provider can
// never break the build.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FETCHED_DIR,
  FETCHED_URL as FETCHED_URL_PREFIX,
  GENERATED_POOL_PATH,
  MANIFEST_PATH,
  mapPexelsVideo,
  mapPixabayVideo,
  pixabayRenditions,
  mergeClips,
  generatedPoolModule,
  type FetchedClip,
  type PexelsVideo,
  type PixabayHit,
  type StockManifest,
} from "../src/lib/stock-fetch";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// One query per Clipflow niche — keywords feed the pool matcher directly.
const QUERIES = [
  "coding screen developer",
  "finance stock market chart",
  "gaming setup neon",
  "fitness workout gym",
  "cooking food kitchen",
  "studying writing desk",
  "video editing studio",
  "minimal product desk",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadKeys(): Promise<{ pexels?: string; pixabay?: string }> {
  const env = { pexels: process.env.PEXELS_API_KEY || undefined, pixabay: process.env.PIXABAY_API_KEY || undefined };
  if (env.pexels || env.pixabay) return env;
  try {
    return JSON.parse(await readFile(join(root, "stock-keys.local.json"), "utf8"));
  } catch {
    return {};
  }
}

async function pexelsSearch(key: string, query: string): Promise<PexelsVideo[]> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=6&orientation=portrait`;
  const response = await fetch(url, { headers: { Authorization: key } });
  if (!response.ok) throw new Error(`Pexels ${response.status}: ${(await response.text()).slice(0, 120)}`);
  return ((await response.json()) as { videos?: PexelsVideo[] }).videos ?? [];
}

async function pixabaySearch(key: string, query: string): Promise<PixabayHit[]> {
  const url = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=6&video_type=film`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pixabay ${response.status}: ${(await response.text()).slice(0, 120)}`);
  return ((await response.json()) as { hits?: PixabayHit[] }).hits ?? [];
}

async function download(clip: FetchedClip, url: string): Promise<boolean> {
  const target = join(root, FETCHED_DIR, clip.src.slice(`${FETCHED_URL_PREFIX}/`.length));
  try {
    await readFile(target);
    return false; // already on disk
  } catch { /* fetch it */ }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${clip.src} ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return true;
}

async function main() {
  const force = process.argv.includes("--force");
  const now = new Date().toISOString();
  const keys = await loadKeys();
  if (!keys.pexels && !keys.pixabay) {
    console.log("stock:fetch — no API keys found, pool unchanged (graceful skip).");
    console.log("Add keys to run it: set PEXELS_API_KEY / PIXABAY_API_KEY, or create stock-keys.local.json");
    console.log('with {"pexels": "<free key>", "pixabay": "<free key>"} (both APIs are free for commercial use).');
    console.log(`Queries planned: ${QUERIES.join(" | ")}`);
    return;
  }

  let previous: StockManifest = { version: 1, fetchedAt: "1970-01-01T00:00:00.000Z", clips: [] };
  try { previous = JSON.parse(await readFile(join(root, MANIFEST_PATH), "utf8")); } catch { /* first run */ }
  const ageDays = (Date.now() - Date.parse(previous.fetchedAt)) / 86_400_000;
  const fresh = !force && ageDays < 7 && previous.clips.length > 0;

  const incoming: Array<{ clip: FetchedClip; url: string }> = [];
  if (keys.pexels) {
    if (fresh && previous.clips.some((c) => c.provider === "pexels")) {
      console.log(`Pexels: manifest is ${ageDays.toFixed(1)} days old — kept (use --force to refetch).`);
    } else {
      for (const query of QUERIES) {
        try {
          const videos = await pexelsSearch(keys.pexels, query);
          for (const item of videos) {
            const clip = mapPexelsVideo(item, query, now);
            const file = (item.video_files ?? []).find((f) => f.link && f.width === clip?.width && f.height === clip?.height);
            if (clip && file) incoming.push({ clip, url: file.link });
          }
          await sleep(1200); // stay well under the rate limit
        } catch (error) { console.warn(`Pexels "${query}": ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
  }
  if (keys.pixabay) {
    if (fresh && previous.clips.some((c) => c.provider === "pixabay")) {
      console.log(`Pixabay: manifest is ${ageDays.toFixed(1)} days old — kept (use --force to refetch).`);
    } else {
      for (const query of QUERIES) {
        try {
          const hits = await pixabaySearch(keys.pixabay, query);
          for (const hit of hits) {
            const clip = mapPixabayVideo(hit, query, now);
            const rendition = clip && pixabayRenditions(hit).find((r) => r.width === clip.width && r.height === clip.height);
            if (clip && rendition) incoming.push({ clip, url: rendition.url });
          }
          await sleep(1200);
        } catch (error) { console.warn(`Pixabay "${query}": ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
  }

  await mkdir(join(root, FETCHED_DIR), { recursive: true });
  let downloaded = 0;
  for (const { clip, url } of incoming) {
    try {
      if (await download(clip, url)) downloaded += 1;
    } catch (error) { console.warn(`download ${clip.src}: ${error instanceof Error ? error.message : String(error)}`); }
  }

  const manifest = mergeClips(previous.clips, incoming.map((entry) => entry.clip), now);
  await writeFile(join(root, MANIFEST_PATH), JSON.stringify(manifest, null, 2));
  await writeFile(join(root, GENERATED_POOL_PATH), generatedPoolModule(manifest.clips));
  console.log(`stock:fetch — ${incoming.length} candidates, ${downloaded} new downloads, pool now ${manifest.clips.length} fetched clips.`);
  console.log(`Regenerated ${GENERATED_POOL_PATH}; restart vite/preview to pick it up.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
