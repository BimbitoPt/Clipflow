import type { Profile } from "./profile";

export interface StockAsset {
  kind: "image" | "video";
  src: string;
  el: ImageBitmap | HTMLVideoElement;
  keywords: string[];
}

export interface PoolEntry {
  kind: "image" | "video";
  src: string;
  keywords: string[];
}

// Local stock pool: 26 shipped photos + 6 motion clip slots + 2 MSTUDIO
// site case-study takes (real client-proof footage — must outscore generic
// stock on site-related queries so case-study videos open on the site).
// Photos 1-9 Unsplash, 10-25 Picsum/Unsplash (free). Clips are local
// Ken Burns motion renders (interim video stock) — replace with Pexels/
// Coverr/Pixabay when verified IDs land. See docs/broll.md.
// Missing files fall back to gradient — never throw.
export const STOCK_POOL: PoolEntry[] = [
  { kind: "image", src: "/broll/1.jpg", keywords: ["desk", "office", "monitor", "laptop", "website", "dark", "workspace", "night", "work"] },
  { kind: "image", src: "/broll/2.jpg", keywords: ["code", "laptop", "keyboard", "screen", "developer", "vscode", "dark", "work"] },
  { kind: "image", src: "/broll/3.jpg", keywords: ["chair", "office", "desk", "monitor", "dark", "workspace", "night", "shelf"] },
  { kind: "image", src: "/broll/4.jpg", keywords: ["chair", "office", "desk", "monitor", "dark", "workspace", "night", "shelf"] },
  { kind: "image", src: "/broll/5.jpg", keywords: ["code", "java", "laptop", "screen", "developer", "phone", "desk", "dark", "work"] },
  { kind: "image", src: "/broll/6.jpg", keywords: ["camera", "cinema", "tripod", "studio", "film", "production", "video"] },
  { kind: "image", src: "/broll/7.jpg", keywords: ["camera", "cinema", "fisheye", "studio", "film", "production", "tripod"] },
  { kind: "image", src: "/broll/8.jpg", keywords: ["creator", "woman", "filming", "camera", "tripod", "video", "home"] },
  { kind: "image", src: "/broll/9.jpg", keywords: ["tablet", "camera", "tripod", "video", "call", "creator", "filming", "desk"] },
  { kind: "image", src: "/broll/10.jpg", keywords: ["laptop", "typing", "hands", "keyboard", "desk", "workspace", "coffee", "work", "macbook"] },
  { kind: "image", src: "/broll/11.jpg", keywords: ["phone", "iphone", "mobile", "laptop", "hands", "desk", "hold", "social", "tech"] },
  { kind: "image", src: "/broll/12.jpg", keywords: ["laptop", "keyboard", "macbook", "desk", "workspace", "minimal", "closeup"] },
  { kind: "image", src: "/broll/13.jpg", keywords: ["flatlay", "glasses", "watch", "phone", "pen", "notebook", "style", "accessories", "minimal"] },
  { kind: "image", src: "/broll/14.jpg", keywords: ["laptop", "macbook", "cafe", "desk", "workspace", "phone", "work"] },
  { kind: "image", src: "/broll/15.jpg", keywords: ["desk", "workspace", "keyboard", "monitor", "mouse", "glasses", "notebook", "phone", "setup", "minimal"] },
  { kind: "image", src: "/broll/16.jpg", keywords: ["gaming", "controller", "console", "playstation", "gadget", "dark", "tech"] },
  { kind: "image", src: "/broll/17.jpg", keywords: ["flowers", "nature", "bloom", "sky", "pink", "spring", "outdoor"] },
  { kind: "image", src: "/broll/18.jpg", keywords: ["laptop", "website", "wireframe", "design", "sketch", "notebook", "mockup", "plan", "webdesign"] },
  { kind: "image", src: "/broll/19.jpg", keywords: ["glasses", "laptop", "macbook", "desk", "mouse", "reading", "minimal", "workspace"] },
  { kind: "image", src: "/broll/20.jpg", keywords: ["sunset", "sky", "clouds", "water", "pastel", "calm", "minimal", "nature"] },
  { kind: "image", src: "/broll/21.jpg", keywords: ["leopard", "wildlife", "safari", "animal", "nature", "wild"] },
  { kind: "image", src: "/broll/22.jpg", keywords: ["dandelion", "flower", "macro", "nature", "hand", "delicate"] },
  { kind: "image", src: "/broll/23.jpg", keywords: ["railway", "tracks", "city", "dusk", "night", "urban", "journey", "industrial"] },
  { kind: "image", src: "/broll/24.jpg", keywords: ["camera", "vintage", "film", "lens", "photography", "retro", "analog"] },
  { kind: "image", src: "/broll/25.jpg", keywords: ["canal", "city", "dusk", "water", "europe", "buildings", "evening", "urban"] },
  { kind: "image", src: "/broll/26.jpg", keywords: ["code", "editor", "screen", "dark", "typescript", "website", "build", "developer"] },
  { kind: "video", src: "/broll/clips/clip-1.mp4", keywords: ["flatlay", "glasses", "watch", "phone", "minimal", "style", "desk"] },
  { kind: "video", src: "/broll/clips/clip-2.mp4", keywords: ["flowers", "nature", "bloom", "sky", "spring", "outdoor", "minimal"] },
  { kind: "video", src: "/broll/clips/clip-3.mp4", keywords: ["dandelion", "flower", "macro", "nature", "hand", "delicate", "minimal"] },
  { kind: "video", src: "/broll/clips/clip-4.mp4", keywords: ["laptop", "website", "wireframe", "design", "mockup", "webdesign", "plan", "desk"] },
  { kind: "video", src: "/broll/clips/clip-5.mp4", keywords: ["railway", "city", "dusk", "night", "urban", "journey"] },
  { kind: "video", src: "/broll/clips/clip-6.mp4", keywords: ["laptop", "typing", "hands", "keyboard", "desk", "work", "macbook", "coffee"] },
  { kind: "video", src: "/broll/clips/web-mstudioweb-hero.mp4", keywords: ["website", "site", "speed", "mstudio", "mstudioweb", "homepage", "hero", "webdesign", "custom", "builds", "ships", "portfolio"] },
  { kind: "video", src: "/broll/clips/web-mstudioweb-scroll.mp4", keywords: ["website", "site", "scroll", "mstudio", "mstudioweb", "page", "tour", "speed", "webdesign", "ships", "custom", "walkthrough"] },
];

export function tokenizeQuery(text: string): Set<string> {
  const out = new Set<string>();
  for (const tok of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    if (tok.length >= 2) out.add(tok);
  }
  return out;
}

function scoreEntry(entry: PoolEntry, tokens: Set<string>): number {
  let score = 0;
  for (const kw of entry.keywords) {
    const k = kw.toLowerCase();
    if (tokens.has(k)) {
      score += 2;
      continue;
    }
    if (k.length >= 4) {
      for (const t of tokens) {
        if (t.length >= 4 && (t.includes(k) || k.includes(t))) {
          score += 1;
          break;
        }
      }
    }
  }
  return score;
}

export function matchAsset(query: string, excludeSrcs?: Set<string>): PoolEntry {
  const tokens = tokenizeQuery(query);
  let best: PoolEntry | null = null;
  let bestScore = -1;
  for (const entry of STOCK_POOL) {
    if (excludeSrcs?.has(entry.src)) continue;
    const s = scoreEntry(entry, tokens);
    if (s > bestScore) {
      bestScore = s;
      best = entry;
    }
  }
  if (best) return best;
  // Pool exhausted (all excluded): allow repeats, first entry wins.
  return STOCK_POOL[0]!;
}

/** Assign 1 pool entry per cue (hook/beat1/beat2/beat3/cta = 5). Distinct when possible. */
export function assignCueAssets(idea: string, profile: Profile, cueTexts: string[]): PoolEntry[] {
  const base = [idea, profile.niche, profile.audience, profile.offer, profile.tone, profile.proof].join(" ");
  // The hook is the most important cue: bias it toward code-on-screen
  // visuals so tech videos open on code, never on lifestyle filler.
  const HOOK_BOOST = "code editor screen typescript website build";
  // Motion clips are renders OF photos: one photo source per video, so a
  // photo and its motion twin never appear as two different cues.
  const usedSrc = new Set<string>();
  const usedSource = new Set<string>();
  return cueTexts.map((cueText, i) => {
    const q = i === 0 ? `${base} ${cueText} ${HOOK_BOOST}` : `${base} ${cueText}`;
    let entry = matchAsset(q, usedSrc);
    let guard = 0;
    while (usedSource.has(sourceOf(entry.src)) && guard++ < STOCK_POOL.length) {
      usedSrc.add(entry.src);
      entry = matchAsset(q, usedSrc);
    }
    usedSrc.add(entry.src);
    usedSource.add(sourceOf(entry.src));
    return entry;
  });
}

/** Per-video editorial override: pin any cue to an explicit asset
 * (e.g. wall-to-wall case-study footage for one client video). Null slots
 * keep the automatic pick. Kind is inferred from the extension; files must
 * exist under public/ or the cue falls back to gradient at preload. */
export function applyAssetOverride(
  entries: PoolEntry[],
  override: Array<string | null> | null | undefined,
): PoolEntry[] {
  if (!override) return entries;
  return entries.map((entry, i) => {
    const src = override[i];
    if (typeof src !== "string" || src.length === 0) return entry;
    return { kind: src.toLowerCase().endsWith(".mp4") ? "video" : "image", src, keywords: [] };
  });
}

/** Canonical photo source: `/broll/N.jpg` → N; motion clips map to the
 * photo they were rendered from (verified 2026-09-15). */
export function sourceOf(src: string): string {
  const m = /^\/broll\/(\d+)\.jpg$/.exec(src);
  if (m) return m[1]!;
  const clipMap: Record<string, string> = {
    "/broll/clips/clip-1.mp4": "13",
    "/broll/clips/clip-2.mp4": "17",
    "/broll/clips/clip-3.mp4": "22",
    "/broll/clips/clip-4.mp4": "18",
    "/broll/clips/clip-5.mp4": "23",
    "/broll/clips/clip-6.mp4": "10",
    // Site case-study takes are distinct takes (hero zoom vs scroll pass),
    // so both can appear in one video as different sources.
    "/broll/clips/web-mstudioweb-hero.mp4": "web-hero",
    "/broll/clips/web-mstudioweb-scroll.mp4": "web-scroll",
  };
  return clipMap[src] ?? src;
}

const assetCache = new Map<string, StockAsset>();

export function getCachedAsset(src: string): StockAsset | undefined {
  return assetCache.get(src);
}

export function clearAssetCache(): void {
  assetCache.clear();
}

async function loadImageEntry(entry: PoolEntry): Promise<StockAsset> {
  const cached = assetCache.get(entry.src);
  if (cached) return cached;
  const res = await fetch(entry.src);
  if (!res.ok) throw new Error(`E_BROLL_FETCH: ${entry.src} -> ${res.status}`);
  const blob = await res.blob();
  const el = await createImageBitmap(blob);
  const asset: StockAsset = { kind: "image", src: entry.src, el, keywords: entry.keywords };
  assetCache.set(entry.src, asset);
  return asset;
}

function loadVideoElement(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    try {
      const v = document.createElement("video");
      let timer: ReturnType<typeof setTimeout>;
      v.muted = true;
      (v as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
      v.loop = true;
      v.preload = "auto";
      v.crossOrigin = "anonymous";
      const done = () => {
        cleanup();
        resolve(v);
      };
      const fail = () => {
        cleanup();
        reject(new Error(`E_BROLL_VIDEO: ${src}`));
      };
      const cleanup = () => {
        clearTimeout(timer);
        v.removeEventListener("canplay", done);
        v.removeEventListener("error", fail);
      };
      v.addEventListener("canplay", done, { once: true });
      v.addEventListener("error", fail, { once: true });
      timer = setTimeout(() => {
        if (v.readyState >= 2) done();
        else fail();
      }, 4000);
      v.src = src;
      v.load();
      // Play muted for preview paint; export seeks explicitly.
      void v.play().catch(() => {
        // Autoplay blocked — still usable via seek + drawImage.
      });
      // Safety timeout: never hang the auto pipeline.
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

async function loadVideoEntry(entry: PoolEntry): Promise<StockAsset> {
  const cached = assetCache.get(entry.src);
  if (cached) return cached;
  const el = await loadVideoElement(entry.src);
  const asset: StockAsset = { kind: "video", src: entry.src, el, keywords: entry.keywords };
  assetCache.set(entry.src, asset);
  return asset;
}

export async function preloadAsset(entry: PoolEntry): Promise<StockAsset> {
  if (entry.kind === "video") return loadVideoEntry(entry);
  return loadImageEntry(entry);
}

/** Preload 1 asset per cue. Failures resolve to null -> caller paints gradient. Never rejects. */
export async function preloadCueAssets(entries: PoolEntry[]): Promise<Array<StockAsset | null>> {
  const out = await Promise.all(
    entries.map(async (e) => {
      try {
        return await preloadAsset(e);
      } catch {
        return null;
      }
    }),
  );
  return out;
}

/** Intrinsic size for cover-fit, tolerant of stubs/mocks. Never throws.
 * Real <video> elements report width/height IDL attrs as 0 when unset, so
 * intrinsic videoWidth/videoHeight (then naturalWidth/naturalHeight) win —
 * first positive value, never first present key. */
export function assetSize(el: unknown): { w: number; h: number } {
  try {
    const o = el as Record<string, unknown>;
    const num = (v: unknown): number =>
      typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
    const w = num(o["videoWidth"]) || num(o["naturalWidth"]) || num(o["width"]);
    const h = num(o["videoHeight"]) || num(o["naturalHeight"]) || num(o["height"]);
    if (w > 0 && h > 0) return { w, h };
  } catch {
    // fall through to zero size
  }
  return { w: 0, h: 0 };
}
