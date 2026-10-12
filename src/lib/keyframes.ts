import type { Profile } from "./profile";

/**
 * Script-driven keyframe generation.
 *
 * Every scene beat of a generated script gets its own AI keyframe image,
 * fetched from the Pollinations endpoint and cached
 * as blob bytes in the same OPFS store uploads use. Same script → same seed
 * → same image (the prompt feeds both URL and storage id), so reloads and
 * reopened projects never re-hit the network.
 *
 * Tier realities baked in here (measured, not assumed):
 *  - anonymous requests are throttled (~1 per 15s, HTTP 402 + empty JSON)
 *    and carry a bottom-right watermark,
 *  - a free key (enter.pollinations.ai → publishable `pk_...`) adds
 *    `nologo=true&private=true`, removes the watermark and raises limits,
 *  - upstream occasionally returns 500 (retryable).
 * The generator spaces requests, retries both with backoff, and gives up
 * with a typed error so the app falls back to the offline AI pool.
 */

export type KeyframeStatus = "idle" | "generating" | "ready" | "error";

/** Minimum gap between two Pollinations requests (anonymous tier). */
export const KEYFRAME_MIN_INTERVAL_MS = 15_500;
/** Anonymous rate-limit responses arrive as HTTP 402. */
const RATE_LIMIT_STATUS = 402;
const RATE_WAIT_MS = 16_000;
const ERROR_BACKOFF_MS = 4_000;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 4;

/** Deterministic 31-bit hash (FNV-1a) — stable seeds across sessions. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2147483647;
}

/** Prompt derived from one script beat — deterministic, caption-space aware. */
export function buildKeyframePrompt(cue: string, profile: Profile): string {
  const scene = cue.replace(/\s+/g, " ").trim().slice(0, 200) || "opening hook";
  const niche = profile.niche.replace(/\s+/g, " ").trim().slice(0, 60);
  return [
    "Abstract keyframe for a vertical 9:16 short-form video, professional color grade, sharp focus, high detail, cinematic volumetric lighting.",
    `Scene context: ${scene}.`,
    niche ? `Brand niche: ${niche}.` : "",
    "Composition: single minimal geometric subject off-center on rule of thirds, near-black background with electric lime green light energy, soft cinematic glow, dark moody atmosphere, generous empty negative space in the center for caption text, no text, no words, no letters, no logos, no watermark.",
  ].filter(Boolean).join(" ");
}

/** Default negative prompt — keeps text/logos/artifacts out of keyframes. */
export const KEYFRAME_NEGATIVE_PROMPT =
  "text, words, letters, watermark, logo, signature, blurry, low quality, distorted, deformed, noisy, oversaturated";

/** Storage id for a keyframe — must satisfy upload-store's id pattern. */
export function keyframeId(seed: number): string {
  return `gen-${seed.toString(36)}`;
}

/** Recover the seed from a storage id (refetch after cache loss). */
export function keyframeSeedOf(id: string): number | null {
  if (!id.startsWith("gen-")) return null;
  const seed = Number.parseInt(id.slice(4), 36);
  return Number.isSafeInteger(seed) && seed >= 0 ? seed : null;
}

/** Pollinations text-to-image URL (720x1280 matches render resolution).
 *
 * Free account (no card) removes the watermark + raises limits:
 *  1. Sign up at https://enter.pollinations.ai → Keys → create a
 *     publishable key (`pk_...`, client-safe).
 *  2. Pass it as `{ key }` — the URL gains `nologo=true&private=true&key=...`.
 * Without a key the anonymous tier applies (watermarked, ~1 req / 15s).
 */
export interface KeyframeUrlOptions {
  key?: string;
  referrer?: string;
  noLogo?: boolean;
  /** Sent as `negative_prompt` (supported by the image endpoint). */
  negativePrompt?: string;
}

export const POLLINATIONS_KEY_STORAGE = "clipflow.pollinations.key";

/** True for server-side secret keys. */
export function isSecretKey(value: unknown): boolean {
  return typeof value === "string" && value.trim().startsWith("sk_");
}

export function sanitizePollinationsKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const key = value.trim();
  // Publishable keys (pk_...) are the safe default. A secret key (sk_...)
  // is accepted ONLY as a deliberate solo-local override: it must be
  // image-scoped, quest-pollen-only, and budget-capped, live in gitignored
  // local config, and never ship in a build anyone else runs. The day this
  // app has other users, replace this with BYOP OAuth instead.
  if (isSecretKey(key)) {
    if (!/^sk_[A-Za-z0-9._-]{8,}$/.test(key)) return "";
    try {
      console.warn("Pollinations secret key in the browser: solo-local use only. Never share a build containing it; switch to BYOP OAuth for other users.");
    } catch { /* logging is best-effort */ }
    return key;
  }
  if (!/^pk_[A-Za-z0-9._-]{8,}$/.test(key)) return "";
  return key;
}

export function loadPollinationsKey(storage: { getItem(key: string): string | null }): string {
  try {
    return sanitizePollinationsKey(storage.getItem(POLLINATIONS_KEY_STORAGE));
  } catch {
    return "";
  }
}

export function savePollinationsKey(storage: { setItem(key: string, value: string): void; removeItem(key: string): void }, key: string): void {
  const clean = sanitizePollinationsKey(key);
  try {
    if (clean) storage.setItem(POLLINATIONS_KEY_STORAGE, clean);
    else storage.removeItem(POLLINATIONS_KEY_STORAGE);
  } catch { /* session-only key */ }
}

/** Default image model: quest-Pollen billable, proven clean + on-brand.
 * 0.004 pollen/image → 5 keyframes ≈ 0.02 pollen per video. */
export const KEYFRAME_MODEL = "tongyi-mai/z-image-turbo";

export function keyframeUrl(prompt: string, seed: number, options: KeyframeUrlOptions = {}): string {
  const key = sanitizePollinationsKey(options.key ?? "");
  const params = new URLSearchParams({ width: "720", height: "1280", seed: String(seed), model: KEYFRAME_MODEL });
  const wantNoLogo = options.noLogo ?? key.length > 0;
  if (wantNoLogo) {
    params.set("nologo", "true");
    params.set("private", "true");
  }
  const negative = (options.negativePrompt ?? KEYFRAME_NEGATIVE_PROMPT).trim();
  if (negative) params.set("negative_prompt", negative);
  if (key) params.set("key", key);
  else if (options.referrer?.trim()) params.set("referrer", options.referrer.trim());
  return `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${params.toString()}`;
}

export interface KeyframeGeneratorOptions {
  fetchImpl?: (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; blob(): Promise<Blob> }>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minIntervalMs?: number;
  maxAttempts?: number;
  rateWaitMs?: number;
  errorBackoffMs?: number;
  timeoutMs?: number;
}

/**
 * Serialized-tolerant generator: spaces requests by minIntervalMs, retries
 * 402 (rate limit) and 5xx/network errors with backoff, then throws.
 * Injectable clock/fetch/sleep keep tests timer-free.
 */
export function createKeyframeGenerator(options: KeyframeGeneratorOptions = {}) {
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const minInterval = options.minIntervalMs ?? KEYFRAME_MIN_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const rateWait = options.rateWaitMs ?? RATE_WAIT_MS;
  const errorBackoff = options.errorBackoffMs ?? ERROR_BACKOFF_MS;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let lastRequestAt: number | null = null;

  return async function generate(url: string): Promise<Blob> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (lastRequestAt !== null) {
        const gap = now() - lastRequestAt;
        if (gap < minInterval) await sleep(minInterval - gap);
      }
      lastRequestAt = now();
      let response: { ok: boolean; status: number; blob(): Promise<Blob> };
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          response = await fetchImpl(url, { signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      } catch {
        await sleep(errorBackoff * 2 ** attempt);
        continue;
      }
      if (response.ok) return response.blob();
      if (response.status === RATE_LIMIT_STATUS) {
        await sleep(rateWait);
        continue;
      }
      if (response.status >= 500) {
        await sleep(errorBackoff * 2 ** attempt);
        continue;
      }
      throw new Error(`keyframe_failed_${response.status}`);
    }
    throw new Error("keyframe_unavailable");
  };
}

/** Shared instance — one pacing clock across the whole app. */
export const generateKeyframe = createKeyframeGenerator();
