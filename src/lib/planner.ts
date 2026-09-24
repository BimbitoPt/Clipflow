import type { TimedCue, VideoScript } from "./script";

export type SceneVariant = "rays" | "blobs" | "grid" | "waves" | "pulse";

export interface PlannedFrame { t: number; cue: TimedCue; variant?: SceneVariant; }

export const VIDEO_SECS = 45;

export function planFrames(
  script: VideoScript,
  fps: 30 | 60 = 30,
  spans?: Array<{ start: number; end: number }> | null,
): PlannedFrame[] {
  // Voice-driven grid: when the VO pipeline measured real cue spans, the
  // render follows them (total = last span end) instead of the fixed 45s
  // grid. Spans must cover every cue with finite, non-decreasing bounds.
  const useSpans =
    !!spans &&
    spans.length === script.cues.length &&
    spans.every(
      (s, i) =>
        Number.isFinite(s.start) &&
        Number.isFinite(s.end) &&
        s.end > s.start &&
        (i === 0 || s.start >= spans[i - 1]!.end - 0.001),
    );
  const bounds = (i: number): { start: number; end: number } =>
    useSpans ? spans![i]! : script.cues[i]!;
  const total = useSpans ? spans![spans!.length - 1]!.end : VIDEO_SECS;
  const n = Math.max(1, Math.round(total * fps));
  const out: PlannedFrame[] = [];
  const sb = (i: number) => {
    const c = bounds(i);
    return [Math.round(c.start * fps), Math.round(c.end * fps)] as const;
  };
  const BEAT_VARIANTS: SceneVariant[] = ["blobs", "grid", "waves"];
  const variantByCue = new Map<TimedCue, SceneVariant>();
  let beatIdx = 0;
  for (const c of script.cues) {
    if (c.kind === "hook") variantByCue.set(c, "rays");
    else if (c.kind === "cta") variantByCue.set(c, "pulse");
    else {
      variantByCue.set(c, BEAT_VARIANTS[beatIdx % BEAT_VARIANTS.length]!);
      beatIdx++;
    }
  }
  const fallbackFor = (kind: TimedCue["kind"]): SceneVariant =>
    kind === "hook" ? "rays" : kind === "cta" ? "pulse" : "blobs";
  let prev = script.cues[0]!;
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const fi = i;
    const found = script.cues.find((_, ci) => {
      const [sb0, sb1] = sb(ci);
      return fi >= sb0 && fi < sb1;
    });
    const cue = found ?? prev;
    prev = cue;
    out.push({ t, cue, variant: variantByCue.get(cue) ?? fallbackFor(cue.kind) });
  }
  return out;
}

export interface WordCue {
  word: string;
  start: number;
  end: number;
  cueKind: "hook" | "beat" | "cta";
}

export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface TimedCueTiming {
  /** Measured speech span (absolute video seconds) for this cue. */
  span: [number, number];
  /** Per-word times (absolute video seconds), or null when unavailable. */
  words: TimedWord[] | null;
}

/**
 * Voice-timed word planning: when real synthesis timings exist (SAPI word
 * onsets), captions follow the voice instead of the even-split grid. Per
 * cue, timed words win only on exact token-count match; otherwise the cue
 * falls back to an even split across its measured speech span (or the cue
 * window when no span is known). Null timing == planWords(script).
 */
export function planWordsTimed(
  script: VideoScript,
  timed: Array<TimedCueTiming | null> | null | undefined,
): WordCue[] {
  if (!timed) return planWords(script);
  const out: WordCue[] = [];
  script.cues.forEach((cue, i) => {
    const tokens = cue.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;
    const t = timed[i];
    // Timed words win only on exact token-count match with finite,
    // non-decreasing times — degenerate sidecars fall back, never garbage.
    const timedOk =
      !!t &&
      !!t.words &&
      t.words.length === tokens.length &&
      t.words.every((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start);
    if (timedOk) {
      t.words!.forEach((w, k) => {
        out.push({
          word: tokens[k]!,
          start: w.start,
          end: Math.max(w.end, w.start + 0.05),
          cueKind: cue.kind,
        });
      });
      return;
    }
    const s0 = t && t.span ? t.span[0] : cue.start;
    const s1 = t && t.span ? t.span[1] : cue.end;
    tokens.forEach((word, k) => {
      out.push({
        word,
        start: s0 + ((s1 - s0) * k) / tokens.length,
        end: s0 + ((s1 - s0) * (k + 1)) / tokens.length,
        cueKind: cue.kind,
      });
    });
  });
  return out;
}

/**
 * Even-split word timing: each cue's [start, end) span is divided evenly
 * across its whitespace-separated tokens, so word windows are float seconds.
 * Consumers must compare with `start <= t < end` plus a last-word-of-cue
 * fallback (same rule as planFrames) — never integer frame indices.
 */
export function planWords(script: VideoScript): WordCue[] {
  const out: WordCue[] = [];
  for (const cue of script.cues) {
    const tokens = cue.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const span = cue.end - cue.start;
    tokens.forEach((word, i) => {
      out.push({
        word,
        start: cue.start + (span * i) / tokens.length,
        end: cue.start + (span * (i + 1)) / tokens.length,
        cueKind: cue.kind,
      });
    });
  }
  return out;
}
