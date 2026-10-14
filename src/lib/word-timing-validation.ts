import type { TimedCueTiming } from "./planner";

/**
 * Runtime schema for timing sidecars loaded from browser storage or project
 * files. Genuine producers (wordSpansFromDurations + alignCueWordTimings)
 * emit cursor-built spans: non-negative, contained, gap-tolerant but never
 * overlapping — so anything outside that shape is corruption, and the whole
 * payload is rejected rather than letting NaN/inverted/out-of-range times
 * reach frame planning (planFrames, caption windows).
 */

/** A single [start, end] window: finite, non-negative, strictly positive. */
export function isTimingWindow(value: unknown): value is { start: number; end: number } {
  if (!value || typeof value !== "object") return false;
  const window = value as { start?: unknown; end?: unknown };
  return (
    typeof window.start === "number" &&
    typeof window.end === "number" &&
    Number.isFinite(window.start) &&
    Number.isFinite(window.end) &&
    window.start >= 0 &&
    // Strict: planFrames falls back to the fixed grid on zero-width spans,
    // so a zero-width window carries no usable timing.
    window.end > window.start
  );
}

/** Runtime guard for one timed cue: span bounds plus contained, ordered words. */
export function isTimedCueTiming(value: unknown): value is TimedCueTiming {
  if (!value || typeof value !== "object") return false;
  const cue = value as { span?: unknown; words?: unknown };
  if (
    !Array.isArray(cue.span) ||
    cue.span.length !== 2 ||
    !cue.span.every((time) => typeof time === "number" && Number.isFinite(time)) ||
    cue.span[0] < 0 ||
    cue.span[1] <= cue.span[0]
  )
    return false;
  const [spanStart, spanEnd] = cue.span as [number, number];
  if (cue.words === null) return true;
  if (!Array.isArray(cue.words)) return false;
  let prevEnd = spanStart;
  return cue.words.every((word) => {
    if (!word || typeof word !== "object") return false;
    const item = word as { word?: unknown; start?: unknown; end?: unknown };
    if (
      typeof item.word !== "string" ||
      item.word.length === 0 ||
      typeof item.start !== "number" ||
      !Number.isFinite(item.start) ||
      typeof item.end !== "number" ||
      !Number.isFinite(item.end) ||
      item.start < spanStart ||
      item.end > spanEnd ||
      item.end < item.start ||
      item.start < prevEnd
    )
      return false;
    prevEnd = item.end;
    return true;
  });
}

/**
 * The whole cue array: every cue valid and cue spans ordered (producers emit
 * cues in timeline order; disorder is corruption, rejected as a whole to
 * match the downstream voiceGridFromCues fixed-grid fallback semantics —
 * same prev-end tracking with the same 1e-6 tolerance).
 */
export function isTimedCueTimingArray(value: unknown): value is TimedCueTiming[] {
  if (!Array.isArray(value)) return false;
  let prevEnd = 0;
  return value.every((cue) => {
    if (!isTimedCueTiming(cue)) return false;
    const span = (cue as { span: [number, number] }).span;
    if (span[0] < prevEnd - 1e-6) return false;
    prevEnd = span[1];
    return true;
  });
}
