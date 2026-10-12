// Pure mapping + merge logic for the stock fetcher (scripts/fetch-stock.ts).
// Providers: Pexels (Pexels License) and Pixabay (Pixabay Content License) —
// both free for commercial use; downloaded renditions live in
// public/broll/fetched/ (24h cache rule honored by the runner's manifest).

import type { PoolEntry } from "./broll";

export interface FetchedClip extends PoolEntry {
  provider: "pexels" | "pixabay";
  id: string;
  width: number;
  height: number;
  seconds: number;
  pageUrl: string;
  fetchedAt: string;
}

export interface StockManifest {
  version: 1;
  fetchedAt: string;
  clips: FetchedClip[];
}

export const FETCHED_DIR = "public/broll/fetched";
/** Web-root URL for pool srcs (public/ is the server root). */
export const FETCHED_URL = "/broll/fetched";
export const MANIFEST_PATH = `${FETCHED_DIR}/manifest.json`;
export const GENERATED_POOL_PATH = "src/lib/broll-fetched.ts";
export const MAX_FETCHED_CLIPS = 24;

const MIN_SECONDS = 4;
const MAX_SECONDS = 40;

type PexelsFile = { width: number; height: number; quality: string; link: string };
export type PexelsVideo = { id: number; duration: number; url: string; video_files?: PexelsFile[] };
type PixabayRendition = { url: string; width: number; height: number };
export type PixabayHit = { id: number; duration: number; pageURL: string; tags: string; videos?: Record<string, PixabayRendition | undefined> };

function queryTokens(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function candidate(
  provider: "pexels" | "pixabay",
  id: string,
  query: string,
  extraKeywords: string[],
  file: { url: string; width: number; height: number },
  seconds: number,
  pageUrl: string,
  now: string,
): FetchedClip {
  const keywords = [...new Set([...extraKeywords, ...queryTokens(query)])];
  return {
    kind: "video",
    src: `${FETCHED_URL}/${provider}-${id}.mp4`,
    keywords,
    provider,
    id,
    width: file.width,
    height: file.height,
    seconds,
    pageUrl,
    fetchedAt: now,
  };
}

type Rendition = { width: number; height: number; url?: string; link?: string };

/** Usable rendition: 480-1080px wide and >=480px tall (portrait heights pass
 * the width cap since only the short edge counts). Portrait preferred, then
 * the largest width — quality without huge files. */
function pickRendition<T extends Rendition>(files: readonly T[]): T | null {
  const usable = files.filter((f) => (f.url ?? f.link) && f.width >= 480 && f.width <= 1080 && f.height >= 480);
  if (!usable.length) return null;
  const portrait = usable.filter((f) => f.height > f.width);
  const pool = portrait.length ? portrait : usable;
  return pool.sort((a, b) => b.width - a.width)[0] ?? null;
}

export function mapPexelsVideo(item: PexelsVideo, query: string, now = new Date().toISOString()): FetchedClip | null {
  if (!item?.id || !Number.isFinite(item.duration) || item.duration < MIN_SECONDS || item.duration > MAX_SECONDS) return null;
  const file = pickRendition(item.video_files ?? []);
  if (!file?.link) return null;
  return candidate("pexels", String(item.id), query, [], { url: file.link, width: file.width, height: file.height }, item.duration, item.url, now);
}

/** All Pixabay renditions of a hit with a URL, largest first. */
export function pixabayRenditions(hit: PixabayHit): PixabayRendition[] {
  const videos = hit.videos ?? {};
  return [videos.large, videos.medium, videos.small, videos.tiny].filter((r): r is PixabayRendition => Boolean(r?.url));
}

/** Pixabay: same rendition rule as Pexels; tags become extra keywords. */
export function mapPixabayVideo(hit: PixabayHit, query: string, now = new Date().toISOString()): FetchedClip | null {
  if (!hit?.id || !Number.isFinite(hit.duration) || hit.duration < MIN_SECONDS || hit.duration > MAX_SECONDS) return null;
  const file = pickRendition(pixabayRenditions(hit));
  if (!file?.url) return null;
  const tagList = (hit.tags ?? "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  return candidate("pixabay", String(hit.id), query, tagList, file, hit.duration, hit.pageURL, now);
}

/** Dedupe by provider+id, newest wins, cap at MAX_FETCHED_CLIPS. */
export function mergeClips(previous: readonly FetchedClip[], incoming: readonly FetchedClip[], now = new Date().toISOString()): StockManifest {
  const byKey = new Map<string, FetchedClip>();
  for (const clip of [...previous, ...incoming]) {
    byKey.set(`${clip.provider}:${clip.id}`, clip);
  }
  const clips = [...byKey.values()]
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt) || a.src.localeCompare(b.src))
    .slice(0, MAX_FETCHED_CLIPS)
    .sort((a, b) => a.src.localeCompare(b.src));
  return { version: 1, fetchedAt: now, clips };
}

/** Source of the generated module: empty until stock:fetch runs with keys. */
export function generatedPoolModule(clips: readonly FetchedClip[]): string {
  const body = clips
    .map((c) => `  { kind: "video", src: ${JSON.stringify(c.src)}, keywords: ${JSON.stringify(c.keywords)} },`)
    .join("\n");
  return `// GENERATED by \`npm run stock:fetch\` — do not edit by hand.
// Downloaded stock clips (Pexels License / Pixabay Content License, both free
// for commercial use). The MP4s live in public/broll/fetched/ — to ship them,
// \`git add -f public/broll/fetched\` together with this file.
import type { PoolEntry } from "./broll";

export const FETCHED_STOCK: PoolEntry[] = [${body ? `\n${body}\n` : "\n"}];
`;
}
