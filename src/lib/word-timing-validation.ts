import type { TimedCueTiming } from "./planner";

/** Runtime guard for timing sidecars loaded from browser storage or project files. */
export function isTimedCueTiming(value: unknown): value is TimedCueTiming {
  if (!value || typeof value !== "object") return false;
  const cue = value as { span?: unknown; words?: unknown };
  if (
    !Array.isArray(cue.span) ||
    cue.span.length !== 2 ||
    !cue.span.every((time) => typeof time === "number" && Number.isFinite(time)) ||
    cue.span[1] <= cue.span[0]
  ) return false;
  if (cue.words === null) return true;
  if (!Array.isArray(cue.words)) return false;
  return cue.words.every((word) => {
    if (!word || typeof word !== "object") return false;
    const item = word as { word?: unknown; start?: unknown; end?: unknown };
    return typeof item.word === "string" &&
      typeof item.start === "number" && Number.isFinite(item.start) &&
      typeof item.end === "number" && Number.isFinite(item.end) &&
      item.end >= item.start;
  });
}

export function isTimedCueTimingArray(value: unknown): value is TimedCueTiming[] {
  return Array.isArray(value) && value.every(isTimedCueTiming);
}
