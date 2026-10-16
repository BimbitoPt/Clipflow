import type { NichePack } from "./packs";
import { planFrames } from "./planner";
import type { VideoScript } from "./script";

export interface ShotCard {
  cueIndex: 0 | 1 | 2 | 3 | 4;
  kind: string;
  start: number;
  end: number;
  durationSecs: number;
  imagePrompt: string;
  cameraDirection: string;
  motionVariant: string;
  sceneLabel: string;
}

/** The shot-card fields a director can hand-edit (all others stay derived). */
export type ShotEditField = "imagePrompt" | "cameraDirection" | "durationSecs";

/** Every editable field, in card order. Shared by the card and `restoreShot`. */
export const SHOT_EDIT_FIELDS: readonly ShotEditField[] = ["imagePrompt", "cameraDirection", "durationSecs"];

/**
 * One shot's overrides. Sparse on purpose: only fields the user actually
 * changed are stored, so an untouched field keeps tracking the script.
 */
export interface ShotEdit {
  imagePrompt?: string;
  cameraDirection?: string;
  durationSecs?: number;
}

/** Per-shot overrides keyed by cue index ("0".."4"), mirroring `planSeeds`. */
export type PlanEdits = Record<number, ShotEdit>;

/** Character budgets and duration range for the editable fields. */
export const SHOT_PROMPT_MAX = 500;
export const CAMERA_DIRECTION_MAX = 200;
export const SHOT_MIN_SECS = 1;
export const SHOT_MAX_SECS = 60;

const SHOT_INDEX_KEYS = new Set(["0", "1", "2", "3", "4"]);

/** Round a duration to the 0.1s grid the shot cards display. */
export function roundSecs(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

export interface StyleRef {
  packId: string;
  packLabel: string;
  bg: [string, string];
  accent: string;
  font: string;
  voice: string;
  persona: string;
}

export interface ProductionPlan {
  shots: ShotCard[];
  style: StyleRef;
  totalSecs: number;
}

const CAMERA_BY_KIND: Record<string, string> = {
  hook: "Punch-in close-up, locked 9:16 center framing, fast 0.5s push",
  beat: "Slow lateral tracking shot, subject centered in safe zone",
  cta: "Static hero framing, centered, hold for end-card legibility",
};

export function buildProductionPlan(script: VideoScript, pack: NichePack, voice: string): ProductionPlan {
  const frames = planFrames(script, 30);
  // planFrames stores the same TimedCue object refs it received, so ===
  // matches the first rendered frame of each cue; fallback keeps us total.
  const variantByCue = script.cues.map((cue) => frames.find((f) => f.cue === cue)?.variant ?? "rays");
  const theme = pack.themes[0] ?? { bg: ["#080A0D", "#101418"] as [string, string], accent: "#FFFFFF", font: "system-ui" };
  const shots: ShotCard[] = script.cues.map((cue, i) => ({
    cueIndex: i as ShotCard["cueIndex"],
    kind: cue.kind,
    start: cue.start,
    end: cue.end,
    durationSecs: Math.round((cue.end - cue.start) * 10) / 10,
    imagePrompt: `${pack.label} style, ${theme.bg[0]} to ${theme.bg[1]} gradient backdrop, ${cue.text.slice(0, 120)}`,
    cameraDirection: CAMERA_BY_KIND[cue.kind] ?? CAMERA_BY_KIND.beat!,
    motionVariant: variantByCue[i]!,
    sceneLabel: cue.text.split(" ").slice(0, 4).join(" "),
  }));
  return {
    shots,
    style: {
      packId: pack.id, packLabel: pack.label, bg: theme.bg,
      accent: theme.accent, font: theme.font, voice,
      persona: `${pack.label} voice for ${script.cues.length} scenes`,
    },
    totalSecs: Math.round((script.cues[script.cues.length - 1]!.end - script.cues[0]!.start) * 10) / 10,
  };
}

export interface PlanCost {
  units: number;
  renderSecs: number;
  breakdown: { shots: number; voiceSecs: number; pixels: number };
}

export function estimatePlanCost(
  plan: ProductionPlan,
  opts: { voiceOn: boolean; width: number; height: number; fps: number },
): PlanCost {
  const pixels = opts.width * opts.height * opts.fps * plan.totalSecs;
  const units = plan.shots.length * 10 + (opts.voiceOn ? plan.totalSecs : 0) + Math.round(pixels / 1_000_000_000);
  return {
    units,
    renderSecs: plan.totalSecs,
    breakdown: { shots: plan.shots.length, voiceSecs: opts.voiceOn ? plan.totalSecs : 0, pixels },
  };
}

const MOTION_POOL = ["rays", "blobs", "grid", "waves", "pulse"];

/**
 * Director gate: an export requires exactly 5 approved shots. Returns -1
 * when every shot is approved, otherwise the 0-based index of the first
 * unapproved shot for the E_PLAN_APPROVAL message. A short, long, or
 * non-array payload is a gate failure too (reported as shot 1) — a bare
 * findIndex would return -1 on a short array and let it through.
 */
export function findUnapprovedShot(approvedShots: unknown): number {
  if (!Array.isArray(approvedShots) || approvedShots.length !== 5) return 0;
  return approvedShots.findIndex((a) => a !== true);
}

export function regenerateShot(plan: ProductionPlan, cueIndex: number, seed: number): ProductionPlan {
  const shots = plan.shots.map((shot, i) => {
    if (i !== cueIndex) return shot;
    const base = MOTION_POOL.indexOf(shot.motionVariant);
    const safe = base < 0 ? 0 : base;
    const next = MOTION_POOL[(((safe + seed) % MOTION_POOL.length) + MOTION_POOL.length) % MOTION_POOL.length]!;
    return {
      ...shot,
      motionVariant: next,
      imagePrompt: `${shot.imagePrompt} (take ${seed}, ${next} motion)`,
    };
  });
  return { ...plan, shots };
}

/**
 * Validate one proposed shot-field value. Returns a plain-language message,
 * or `null` when the value is acceptable. Durations are seconds within
 * [SHOT_MIN_SECS, SHOT_MAX_SECS]; prompt/camera are non-empty trimmed text
 * inside their character budgets. This is the single gate used by the shot
 * card (inline errors) and by `validPlanEdits` (persistence), so the UI and
 * stored bytes agree on what "valid" means.
 */
export function validateShotField(field: ShotEditField, value: string | number): string | null {
  if (field === "durationSecs") {
    if (typeof value === "string" && value.trim() === "") return "Enter a duration in seconds.";
    const seconds = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(seconds)) return "Duration must be a number.";
    if (seconds < SHOT_MIN_SECS) return `Duration must be at least ${SHOT_MIN_SECS}s.`;
    if (seconds > SHOT_MAX_SECS) return `Duration must be at most ${SHOT_MAX_SECS}s.`;
    return null;
  }
  const text = String(value).trim();
  if (!text) return field === "imagePrompt" ? "Prompt can't be empty." : "Camera direction can't be empty.";
  const max = field === "imagePrompt" ? SHOT_PROMPT_MAX : CAMERA_DIRECTION_MAX;
  return text.length > max ? `Keep it to ${max} characters or fewer.` : null;
}

/** Canonical stored form of a validated value (trimmed text, 0.1s duration). */
export function normalizeShotValue(field: ShotEditField, value: string | number): string | number {
  if (field === "durationSecs") return roundSecs(typeof value === "number" ? value : Number(value));
  return String(value).trim();
}

/**
 * Apply one validated change to the override map. Setting a field back to
 * its derived value removes the override (stored bytes stay minimal), and an
 * empty shot entry is dropped entirely. Returns the SAME object when nothing
 * changed so React state and the dirty flag stay stable. `derived` is the
 * un-edited value from the seeded plan (and for durations, a change also
 * re-sums the plan's `totalSecs` via `applyShotEdits`).
 */
export function setShotEdit(
  edits: PlanEdits,
  cueIndex: number,
  field: ShotEditField,
  value: string | number,
  derived: string | number,
): PlanEdits {
  const normalized = normalizeShotValue(field, value);
  const current = edits[cueIndex];
  const existing = current?.[field];
  const hadOverride = existing !== undefined;
  // Compare on the canonical form: a generated value may carry untrimmed text
  // (a prompt sliced mid-sentence can end in a space), and a revert to it must
  // still register as "no override" or RESTORE GENERATED would leave a
  // permanent phantom override behind.
  const isDerived = normalized === normalizeShotValue(field, derived);
  if (!hadOverride && isDerived) return edits;
  if (hadOverride && normalized === existing) return edits;
  const shot: ShotEdit = { ...(current ?? {}) };
  if (isDerived) {
    delete shot[field];
  } else if (field === "durationSecs") {
    shot.durationSecs = normalized as number;
  } else {
    shot[field] = normalized as string;
  }
  const next: PlanEdits = { ...edits };
  if (Object.keys(shot).length === 0) delete next[cueIndex];
  else next[cueIndex] = shot;
  return next;
}

/**
 * Overlay editable shot overrides onto the seeded plan. Prompt and camera
 * replace the derived text; an edited duration re-sums `totalSecs` so the
 * header and cost estimate track what the plan now specifies. Returns the
 * same plan object when there are no edits (identity for memo stability).
 */
export function applyShotEdits(plan: ProductionPlan, edits: PlanEdits): ProductionPlan {
  if (Object.keys(edits).length === 0) return plan;
  let durationEdited = false;
  const shots = plan.shots.map((shot) => {
    const edit = edits[shot.cueIndex];
    if (!edit) return shot;
    if (edit.durationSecs !== undefined) durationEdited = true;
    return {
      ...shot,
      imagePrompt: edit.imagePrompt ?? shot.imagePrompt,
      cameraDirection: edit.cameraDirection ?? shot.cameraDirection,
      durationSecs: edit.durationSecs ?? shot.durationSecs,
    };
  });
  const totalSecs = durationEdited
    ? roundSecs(shots.reduce((sum, shot) => sum + shot.durationSecs, 0))
    : plan.totalSecs;
  return { ...plan, shots, totalSecs };
}

/**
 * Apply one validated shot-field edit together with its approval
 * consequence. Editing the effective value of a shot invalidates that
 * shot's approval — the approved artifact changed — while a no-op edit
 * (typing then reverting to the current value) leaves both untouched.
 * Pure: returns the next edits map and approvals array for React to set,
 * and returns the SAME references when nothing changed (memo/dirty stable).
 * `derived` is the un-edited value from the seeded plan.
 */
export function editShot(
  edits: PlanEdits,
  approvedShots: boolean[],
  cueIndex: number,
  field: ShotEditField,
  value: string | number,
  derived: string | number,
): { edits: PlanEdits; approvedShots: boolean[] } {
  const nextEdits = setShotEdit(edits, cueIndex, field, value, derived);
  if (nextEdits === edits) return { edits, approvedShots };
  return { edits: nextEdits, approvedShots: approvedShots.map((v, i) => (i === cueIndex ? false : v)) };
}

/**
 * Clear every override on one shot, reverting its card to the generated
 * take. Built on `setShotEdit` (each field reset to its derived value) so
 * the "revert removes the override" rule keeps one home, and it unapproves
 * the shot: the approved artifact changed. Returns the SAME references when
 * the shot had no overrides, so React state and the dirty flag stay stable.
 * `shot` is the un-edited card from the seeded plan.
 */
export function restoreShot(
  edits: PlanEdits,
  approvedShots: boolean[],
  cueIndex: number,
  shot: ShotCard,
): { edits: PlanEdits; approvedShots: boolean[] } {
  if (!edits[cueIndex]) return { edits, approvedShots };
  let next = edits;
  for (const field of SHOT_EDIT_FIELDS) {
    if (edits[cueIndex]?.[field] === undefined) continue;
    next = setShotEdit(next, cueIndex, field, shot[field], shot[field]);
  }
  if (next === edits) return { edits, approvedShots };
  return { edits: next, approvedShots: approvedShots.map((v, i) => (i === cueIndex ? false : v)) };
}

/**
 * Cue indexes whose generated card differs between two plans. The shot card
 * uses this as its staleness key: an open, un-committed draft must be dropped
 * when the value it was typed against is replaced (a regenerated take, a new
 * idea, a restored project), or the field would briefly show text that is no
 * longer part of document state. Compares the three editable fields by value,
 * so a plan rebuilt with identical content reports nothing.
 */
export function changedShotCues(previous: ProductionPlan, next: ProductionPlan): number[] {
  const changed: number[] = [];
  next.shots.forEach((shot, index) => {
    const before = previous.shots[index];
    if (!before || before.imagePrompt !== shot.imagePrompt || before.cameraDirection !== shot.cameraDirection || before.durationSecs !== shot.durationSecs) changed.push(shot.cueIndex);
  });
  return changed;
}

/**
 * Runtime guard for persisted shot edits. Accepts only a plain object whose
 * keys are shot indexes ("0".."4"); each entry keeps only its well-formed
 * fields, and an entry with nothing valid is dropped. Anything unusable
 * degrades to `{}` — per-field, like the timing sidecar, so one corrupt
 * duration never discards a valid prompt. Never rejects the session or
 * project (same precedent as `validPlanSeeds`).
 */
export function validPlanEdits(value: unknown): PlanEdits {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: PlanEdits = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!SHOT_INDEX_KEYS.has(key)) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const edit: ShotEdit = {};
    if (typeof record.imagePrompt === "string" && validateShotField("imagePrompt", record.imagePrompt) === null) {
      edit.imagePrompt = record.imagePrompt.trim();
    }
    if (typeof record.cameraDirection === "string" && validateShotField("cameraDirection", record.cameraDirection) === null) {
      edit.cameraDirection = record.cameraDirection.trim();
    }
    if (typeof record.durationSecs === "number" && validateShotField("durationSecs", record.durationSecs) === null) {
      edit.durationSecs = roundSecs(record.durationSecs);
    }
    if (Object.keys(edit).length > 0) out[Number(key)] = edit;
  }
  return out;
}
