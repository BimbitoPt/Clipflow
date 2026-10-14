import type { CaptionMode } from "../../shared/caption-plan";
import type { VisualEffect } from "../../shared/visual-effects";
import { isPlatformId, type PlatformId } from "../../shared/platform-presets";
import { PACK_IDS, type PackId } from "./packs";
import type { Profile } from "./profile";
import type { ScriptOverrides } from "./script-draft";
import type { SceneChoice } from "./scene-assets";
import { isTimedCueTimingArray, isTimingWindow } from "./word-timing-validation";
import type { TimedCueTiming } from "./planner";
import { safeStorageGet, type KeyValueStore } from "./storage";

/** localStorage key for the browser-only editor session snapshot. */
export const SESSION_KEY = "clipflow.session";

/** localStorage key for the voice-timed karaoke sidecar. */
export const WORDTIMES_KEY = "clipflow.wordtimes";

/**
 * Browser session snapshot. React state (idea, beats, scene choices) dies with
 * the tab while uploads/timing/profile already persist — without this a reload
 * orphaned persisted uploads. Desktop skips it entirely: the native `.clipflow`
 * project is the source of truth there.
 */
export interface SessionSnapshot {
  idea: string;
  scriptOverrides: ScriptOverrides;
  sceneChoices: SceneChoice[];
  captionMode: CaptionMode;
  captionOverrides: Record<number, string>;
  voiceOn: boolean;
  visualEffect: VisualEffect;
  platform: PlatformId;
  credit: boolean;
  pack: PackId;
}

const CAPTION_MODES = ["auto", "scene", "speech", "off"] as const;
const VISUAL_EFFECTS = ["none", "cinematic", "mono", "vivid", "analog"] as const;

/** Runtime guard for one persisted scene choice. */
export function validSceneChoice(choice: unknown): choice is SceneChoice {
  if (!choice || typeof choice !== "object") return false;
  const kind = (choice as { kind?: unknown }).kind;
  return (
    kind === "auto-ai" ||
    kind === "ai" ||
    kind === "stock" ||
    kind === "upload" ||
    kind === "native" ||
    kind === "generated"
  );
}

/**
 * Read and validate the browser session snapshot. Returns `null` on any
 * missing, malformed or version-mismatched payload — session restore is a
 * convenience, never a hard requirement.
 */
export function readSession(store: KeyValueStore): SessionSnapshot | null {
  try {
    const raw = store.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      idea?: unknown;
      scriptOverrides?: unknown;
      sceneChoices?: unknown;
      captionMode?: unknown;
      captionOverrides?: unknown;
      voiceOn?: unknown;
      visualEffect?: unknown;
      platform?: unknown;
      credit?: unknown;
      pack?: unknown;
    };
    if (!parsed || parsed.version !== 1 || typeof parsed.idea !== "string") return null;
    if (!Array.isArray(parsed.sceneChoices) || parsed.sceneChoices.length !== 5 || !parsed.sceneChoices.every(validSceneChoice)) return null;
    if (parsed.scriptOverrides === null || typeof parsed.scriptOverrides !== "object" || Array.isArray(parsed.scriptOverrides)) return null;
    if (!CAPTION_MODES.includes(parsed.captionMode as CaptionMode)) return null;
    if (parsed.captionOverrides === null || typeof parsed.captionOverrides !== "object") return null;
    if (typeof parsed.voiceOn !== "boolean") return null;
    if (!VISUAL_EFFECTS.includes(parsed.visualEffect as VisualEffect)) return null;
    return {
      idea: parsed.idea,
      scriptOverrides: parsed.scriptOverrides as ScriptOverrides,
      sceneChoices: parsed.sceneChoices,
      captionMode: parsed.captionMode as CaptionMode,
      captionOverrides: parsed.captionOverrides as Record<number, string>,
      voiceOn: parsed.voiceOn,
      visualEffect: parsed.visualEffect as VisualEffect,
      platform: isPlatformId(parsed.platform) ? parsed.platform : "tiktok",
      credit: parsed.credit === true,
      pack:
        typeof parsed.pack === "string" && (PACK_IDS as readonly string[]).includes(parsed.pack)
          ? (parsed.pack as PackId)
          : "mstudio",
    };
  } catch {
    return null;
  }
}

/** Persist the browser session snapshot. Best-effort: storage may be unavailable. */
export function writeSession(store: KeyValueStore, snapshot: SessionSnapshot): void {
  try {
    store.setItem(
      SESSION_KEY,
      JSON.stringify({
        version: 1,
        idea: snapshot.idea,
        scriptOverrides: snapshot.scriptOverrides,
        sceneChoices: snapshot.sceneChoices,
        captionMode: snapshot.captionMode,
        captionOverrides: snapshot.captionOverrides,
        voiceOn: snapshot.voiceOn,
        visualEffect: snapshot.visualEffect,
        platform: snapshot.platform,
        credit: snapshot.credit,
        pack: snapshot.pack,
      }),
    );
  } catch {
    // Session restore is convenience; the editor works without it.
  }
}

/**
 * Voice-timed karaoke sidecar (localStorage `clipflow.wordtimes`), written by
 * the headless VO pipeline next to the wav it was measured from. Applied only
 * on an exact idea+profile match — otherwise the deterministic even-split grid
 * is used, so stale timings can never leak into another video.
 */
export interface WordTiming {
  cues: TimedCueTiming[];
  windows: Array<{ start: number; end: number }> | null;
  total: number | null;
  assets: Array<string | null> | null;
}

/**
 * Read and validate the word-timing sidecar for an exact idea+profile match.
 * Cues, windows and assets are validated as a whole: any malformed field
 * rejects the entire sidecar (falling back to the deterministic even-split
 * grid) instead of letting NaN/inverted/out-of-range times reach frame
 * planning. Only `total` degrades per-field — it is duration metadata, and
 * a missing total still leaves usable caption timings.
 */
export function readWordTiming(store: KeyValueStore, idea: string, profile: Profile): WordTiming | null {
  try {
    const raw = safeStorageGet(store, WORDTIMES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      idea?: unknown;
      profile?: Partial<Profile>;
      cues?: unknown;
      windows?: unknown;
      total?: unknown;
      assets?: unknown;
    };
    if (!parsed || parsed.idea !== idea) return null;
    const p = parsed.profile;
    if (
      !p ||
      p.niche !== profile.niche ||
      p.audience !== profile.audience ||
      p.offer !== profile.offer ||
      p.tone !== profile.tone ||
      p.proof !== profile.proof
    ) {
      return null;
    }
    if (!isTimedCueTimingArray(parsed.cues)) return null;
    // Windows drive caption windows and frame planning directly: same
    // length as cues and every bound finite, non-negative, non-inverted —
    // otherwise the whole sidecar is corrupt.
    let windows: Array<{ start: number; end: number }> | null = null;
    // Explicit null degrades like an absent field; only a present-but-
    // malformed value rejects the sidecar.
    if (parsed.windows !== undefined && parsed.windows !== null) {
      if (
        !Array.isArray(parsed.windows) ||
        parsed.windows.length !== parsed.cues.length ||
        !parsed.windows.every(isTimingWindow)
      ) {
        return null;
      }
      windows = parsed.windows;
    }
    const total =
      typeof parsed.total === "number" && Number.isFinite(parsed.total) && parsed.total > 0
        ? parsed.total
        : null;
    let assets: Array<string | null> | null = null;
    if (parsed.assets !== undefined && parsed.assets !== null) {
      // Assets parallel the cues; a length mismatch would misattribute them.
      if (
        !Array.isArray(parsed.assets) ||
        parsed.assets.length !== parsed.cues.length ||
        !parsed.assets.every((a) => a === null || typeof a === "string")
      ) {
        return null;
      }
      assets = parsed.assets;
    }
    return { cues: parsed.cues, windows, total, assets };
  } catch {
    return null;
  }
}

/** Persist or clear the word-timing sidecar. `null` removes it. */
export function writeWordTiming(store: KeyValueStore, raw: string | null): void {
  try {
    if (raw) store.setItem(WORDTIMES_KEY, raw);
    else store.removeItem(WORDTIMES_KEY);
  } catch {
    // Timing is optional; a storage failure must not break project restore.
  }
}

/**
 * Total read of the timing sidecar for project state: never throws,
 * returns the raw blob only when it parses as a JSON object. Deep validation
 * (idea+profile match, cue shapes) stays in `readWordTiming` at use time;
 * this gate only keeps corrupt blobs out of dirty-state and persistence so a
 * storage failure — or a corrupt sidecar — degrades to `null` timing instead
 * of crashing the editor or flapping the dirty flag.
 */
export function validTimingSidecar(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw === "") return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * The one read the project draft performs: safe access plus the validity
 * gate. The hook calls this once for initial state and on project restore —
 * never during render — so React rendering is fully decoupled from
 * persistence.
 */
export function readTimingSidecar(store: KeyValueStore): string | null {
  const raw = safeStorageGet(store, WORDTIMES_KEY);
  return validTimingSidecar(raw) ? raw : null;
}