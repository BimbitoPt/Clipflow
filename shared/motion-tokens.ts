/**
 * Motion tokens — one source of timing/easing truth for every surface that
 * moves: the Remotion deck player, MP4 export, Canvas previews, FFmpeg FX.
 *
 * Values are grounded in what the codebase already ships (springs damping
 * 16–20 / stiffness 75–115, 7–22 frame staggers, 8–34 frame wipes), so
 * adopting a token is a rename, not a behavior change. Framework-free:
 * plain data + frame math, no Remotion/Canvas imports.
 */

export const MOTION_FPS = 30;

export interface SpringConfig {
  damping: number;
  stiffness: number;
  mass?: number;
}

export const SPRINGS = {
  /** Calm entrances, captions, backgrounds. Was {19, 95} scattered. */
  soft: { damping: 19, stiffness: 95 },
  /** Default UI motion. Was {17, 105} / {18, 100} scattered. */
  standard: { damping: 17, stiffness: 105 },
  /** Punchy pops, kinetic type. Was {16, 115}-class. */
  lively: { damping: 16, stiffness: 115 },
} satisfies Record<string, SpringConfig>;

export type SpringId = keyof typeof SPRINGS;

/** Frame counts at 30fps. */
export const DURATIONS = {
  /** Element entrance. */
  enter: 12,
  /** Element exit. */
  exit: 10,
  /** Slide/scene transition. */
  transition: 15,
  /** Beat-hit flash. */
  beat: 6,
  /** Minimum hold so a build state reads before moving on. */
  holdMin: 30,
} as const;

export type DurationId = keyof typeof DURATIONS;

/** Stagger gaps between sequenced elements (frames). */
export const STAGGER = {
  tight: 7,
  loose: 14,
} as const;

export type StaggerId = keyof typeof STAGGER;

/** Transition presentation ids (renderer maps these to primitives). */
export const TRANSITIONS = ["fade", "slide-up", "slide-right", "wipe"] as const;
export type TransitionId = (typeof TRANSITIONS)[number];

export const DEFAULT_TRANSITION: TransitionId = "fade";

/** Frames → ms at a given fps. */
export function framesToMs(frames: number, fps = MOTION_FPS): number {
  return Math.round((frames / fps) * 1000);
}

/** Ms → frames at a given fps. */
export function msToFrames(ms: number, fps = MOTION_FPS): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

/** Start-frame offset of the i-th sequenced element. */
export function staggerStart(index: number, step: number = STAGGER.tight): number {
  return index * step;
}

/**
 * Fade in/out keyframes for a span: [0, inEnd, span-outLen, span].
 * Mirrors the [0, min(10, len/3), len-3, len] shape already in use.
 */
export function fadeKeys(spanFrames: number): [number, number, number, number] {
  const s = Math.max(4, Math.round(spanFrames));
  return [0, Math.min(10, Math.floor(s / 3)), Math.max(1, s - 3), s];
}

/** Clamp helper for token-driven expressions. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
