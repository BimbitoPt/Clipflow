import type { StorageLike } from "./profile";

/**
 * Activation metric + time-to-value instrumentation (local-only).
 *
 * Definitions (see docs/product-design.md):
 * - mini-aha: first live preview render of the user's own idea.
 * - activation: first completed export (a video file in hand).
 * - TTV: firstVisit -> firstExport. Target: minutes, measured not asserted.
 *
 * No backend, no telemetry: milestones live in localStorage as
 * first-occurrence timestamps. The point is a tight, honest metric the
 * product can be held to — and warm-start UX that moves it.
 */

export const ACTIVATION_KEY = "clipflow.activation";

export interface ActivationState {
  firstVisit: number | null;
  firstPreview: number | null;
  firstExport: number | null;
  exportCount: number;
}

const EMPTY: ActivationState = { firstVisit: null, firstPreview: null, firstExport: null, exportCount: 0 };

/** One-click warm start: curated idea in the pack's voice, zero typing. */
export const SAMPLE_IDEA = "Slow sites cost you sales every single week. MSTUDIO ships your new site in two weeks.";

function validTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function loadActivation(storage: StorageLike): ActivationState {
  try {
    const raw = storage.getItem(ACTIVATION_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<Record<keyof ActivationState, unknown>>;
    return {
      firstVisit: validTime(parsed.firstVisit) ? parsed.firstVisit : null,
      firstPreview: validTime(parsed.firstPreview) ? parsed.firstPreview : null,
      firstExport: validTime(parsed.firstExport) ? parsed.firstExport : null,
      exportCount:
        typeof parsed.exportCount === "number" && Number.isInteger(parsed.exportCount) && parsed.exportCount >= 0
          ? parsed.exportCount
          : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

function saveActivation(storage: StorageLike, state: ActivationState): void {
  try {
    storage.setItem(ACTIVATION_KEY, JSON.stringify(state));
  } catch {
    // Instrumentation never breaks the editor.
  }
}

/** Record a first-occurrence milestone. Later calls are no-ops. */
export function markMilestone(
  storage: StorageLike,
  milestone: "firstVisit" | "firstPreview",
  now: number = Date.now(),
): ActivationState {
  const state = loadActivation(storage);
  if (state[milestone] !== null || !validTime(now)) return state;
  const next = { ...state, [milestone]: now };
  saveActivation(storage, next);
  return next;
}

/** Record a completed export: stamps firstExport once, counts every export. */
export function recordExport(storage: StorageLike, now: number = Date.now()): ActivationState {
  const state = loadActivation(storage);
  const next: ActivationState = {
    ...state,
    firstExport: state.firstExport ?? (validTime(now) ? now : null),
    exportCount: state.exportCount + 1,
  };
  saveActivation(storage, next);
  return next;
}

/** Activated = holds a finished video file. Tight by design. */
export function isActivated(state: ActivationState): boolean {
  return state.firstExport !== null;
}

/** Milliseconds from first visit to first preview, or null when unreached. */
export function timeToPreviewMs(state: ActivationState): number | null {
  if (state.firstVisit === null || state.firstPreview === null) return null;
  return Math.max(0, state.firstPreview - state.firstVisit);
}

/** Milliseconds from first visit to activation, or null when unreached. */
export function timeToActivationMs(state: ActivationState): number | null {
  if (state.firstVisit === null || state.firstExport === null) return null;
  return Math.max(0, state.firstExport - state.firstVisit);
}
