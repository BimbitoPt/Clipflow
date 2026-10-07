import { FilterGraph } from "./graph";
import { getEffect } from "./registry";
import { buildAss } from "./ass";
import type {
  BuildParams,
  EffectsLevel,
  FxCtx,
  Intensity,
  NicheProfile,
  PlacedEffect,
  TimelineCues,
  TriggerKind,
} from "./types";

export interface ComposeOpts {
  profile: NicheProfile;
  duration: number;
  level: EffectsLevel;
  seed: number;
  ctx: FxCtx;
  cues: TimelineCues;
  /** Effect ids to force-off. */
  disabled?: string[];
  /** Max placed effects per rolling 10s window. */
  maxPer10s?: number;
  /** Minimum seconds between placed effects. */
  minGap?: number;
  /** Filter ids whose `requires` are unavailable (from checkFilters).
   * Defs needing them are skipped and recorded. */
  unavailable?: Set<string>;
  /** Transcript cues for ASS caption burn-in (optional). */
  assCues?: { text: string; start: number; end: number }[];
  /** Label the fx chain reads from (default: the first input stream). */
  fromLabel?: string;
}

export interface ComposeResult {
  graph: FilterGraph;
  /** Label of the chain output. */
  outLabel: string;
  placed: PlacedEffect[];
  /** Extra `-i` args, in declaration order (append after main inputs). */
  extraInputs: string[];
  /** ASS file content when assCues were given (caller writes to disk). */
  ass?: string;
  skipped: { id: string; reason: string }[];
  requires: string[];
}

const BUDGET: Record<Exclude<EffectsLevel, "off">, { maxPer10s: number; minGap: number }> = {
  subtle: { maxPer10s: 2, minGap: 1.2 },
  medium: { maxPer10s: 4, minGap: 0.7 },
  hype: { maxPer10s: 6, minGap: 0.4 },
};

const LEVEL_INTENSITY: Record<Exclude<EffectsLevel, "off">, Intensity[]> = {
  subtle: ["subtle"],
  medium: ["subtle", "medium"],
  hype: ["medium", "hype"],
};

/** Deterministic PRNG (mulberry32). Same seed + inputs = same placement. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Candidate {
  defId: string;
  start: number;
  duration: number;
  intensity: Intensity;
  trigger: TriggerKind;
  text?: string;
  weight: number;
}

function pickWeighted(rng: () => number, items: { weight: number }[]): number {
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, items[i].weight);
    if (r <= 0) return i;
  }
  return items.length - 1;
}

/**
 * Assemble the timed effect chain for one clip. Pure + deterministic:
 * no clock, no Math.random — everything flows from `seed`.
 */
export function composeTimeline(opts: ComposeOpts): ComposeResult {
  const graph = new FilterGraph();
  const skipped: { id: string; reason: string }[] = [];
  const fromLabel = opts.fromLabel ?? "[0:v]";
  const result: ComposeResult = {
    graph,
    outLabel: fromLabel.replace(/^\[(.+)\]$/, "$1"),
    placed: [],
    extraInputs: [],
    skipped,
    requires: [],
  };
  if (opts.level === "off" || opts.duration <= 0) return result;

  const rng = mulberry32(opts.seed);
  const budget = {
    maxPer10s: opts.maxPer10s ?? BUDGET[opts.level].maxPer10s,
    minGap: opts.minGap ?? BUDGET[opts.level].minGap,
  };
  const intensities = LEVEL_INTENSITY[opts.level];
  const disabled = new Set(opts.disabled ?? []);
  const unavailable = opts.unavailable ?? new Set<string>();
  const profile = opts.profile;
  const D = opts.duration;

  const packOf = (id: string) => profile.pack.effects.find((e) => e.id === id);
  const intensityFor = (id: string): Intensity => {
    const fixed = packOf(id)?.intensity;
    if (fixed) return fixed;
    return intensities[Math.floor(rng() * intensities.length)];
  };
  const clampWin = (start: number, duration: number): [number, number] | null => {
    const s = Math.max(0, Math.min(start, D - 0.2));
    const d = Math.max(0.1, Math.min(duration, D - s));
    return d >= 0.1 ? [s, d] : null;
  };

  const candidates: Candidate[] = [];
  const textable = profile.pack.effects.filter((e) => {
    try {
      const c = getEffect(e.id).category;
      return c === "text" || c === "sticker";
    } catch {
      return false;
    }
  });

  // 1. Transitions on scene cuts.
  if (profile.pack.transition) {
    for (const cut of opts.cues.cuts) {
      if (cut < 0.3 || cut > D - 0.3) continue;
      candidates.push({
        defId: profile.pack.transition,
        start: Math.max(0, cut - 0.25),
        duration: 0.5,
        intensity: intensityFor(profile.pack.transition),
        trigger: "cut",
        weight: 3,
      });
    }
  }
  // 2. Camera/overlay punches on beats.
  const beatPool = profile.pack.effects.filter((e) => {
    try {
      const c = getEffect(e.id).category;
      return c === "camera" || c === "overlay" || c === "sfx-sync";
    } catch {
      return false;
    }
  });
  for (const beat of opts.cues.beats) {
    if (beat < 0.2 || beat > D - 0.2 || beatPool.length === 0) continue;
    const pick = beatPool[pickWeighted(rng, beatPool.map((e) => ({ weight: e.weight })))];
    candidates.push({
      defId: pick.id,
      start: beat,
      duration: 0.4,
      intensity: intensityFor(pick.id),
      trigger: "beat",
      weight: pick.weight,
    });
  }
  // 3. Text/sticker pops on transcript keyword hits.
  for (const kw of opts.cues.keywords) {
    if (kw.t < 0.2 || kw.t > D - 0.5 || textable.length === 0) continue;
    const pick = textable[pickWeighted(rng, textable.map((e) => ({ weight: e.weight })))];
    candidates.push({
      defId: pick.id,
      start: kw.t,
      duration: 1.0,
      intensity: intensityFor(pick.id),
      trigger: "keyword",
      text: kw.word,
      weight: pick.weight,
    });
  }
  // 4. Ambient effects on the pack pacing grid.
  const ambientPool = profile.pack.effects.filter((e) => {
    try {
      const c = getEffect(e.id).category;
      return c === "overlay" || c === "color" || c === "text";
    } catch {
      return false;
    }
  });
  if (ambientPool.length > 0 && profile.pack.pacing > 0) {
    for (let t = profile.pack.pacing / 2; t < D - 0.5; t += profile.pack.pacing) {
      const pick = ambientPool[pickWeighted(rng, ambientPool.map((e) => ({ weight: e.weight })))];
      candidates.push({
        defId: pick.id,
        start: t,
        duration: 1.2,
        intensity: intensityFor(pick.id),
        trigger: "ambient",
        weight: 1,
      });
    }
  }

  // Budget: time order, max per 10s, min gap, no stacked heavies.
  candidates.sort((a, b) => a.start - b.start || b.weight - a.weight);
  const accepted: Candidate[] = [];
  const heavyAt = (t: number): boolean =>
    accepted.some((a) => {
      try {
        return getEffect(a.defId).heavy && t < a.start + a.duration && a.start < t + 0.5;
      } catch {
        return false;
      }
    });
  for (const c of candidates) {
    if (disabled.has(c.defId)) {
      skipped.push({ id: c.defId, reason: "disabled" });
      continue;
    }
    let def;
    try {
      def = getEffect(c.defId);
    } catch {
      skipped.push({ id: c.defId, reason: "unknown-effect" });
      continue;
    }
    // Closed trailing 10s window [c-10, c]: guarantees no rolling 10s
    // window ever holds more than maxPer10s placements.
    const trailing = accepted.filter((a) => a.start >= c.start - 10 && a.start <= c.start).length;
    if (trailing >= budget.maxPer10s) {
      skipped.push({ id: c.defId, reason: "budget" });
      continue;
    }
    if (accepted.length > 0 && c.start - accepted[accepted.length - 1].start < budget.minGap) {
      skipped.push({ id: c.defId, reason: "spacing" });
      continue;
    }
    if (def.heavy && heavyAt(c.start)) {
      skipped.push({ id: c.defId, reason: "heavy-overlap" });
      continue;
    }
    accepted.push({ ...c, intensity: def.intensities.includes(c.intensity) ? c.intensity : def.intensities[0] });
  }

  // Grade first (full-duration look), then placements in time order.
  const running: string[] = [];
  const requires = new Set<string>();
  const place = (defId: string, start: number, duration: number, intensity: Intensity, text?: string): boolean => {
    const def = getEffect(defId);
    const boxed = clampWin(start, duration);
    if (!boxed) return false;
    const params: BuildParams = { start: boxed[0], duration: boxed[1], intensity, variant: rng(), text };
    const built = def.build(params, opts.ctx);
    for (const need of built.requires ?? []) {
      if (unavailable.has(need)) {
        skipped.push({ id: defId, reason: `missing-filter:${need}` });
        return false;
      }
      requires.add(need);
    }
    for (const input of built.inputs ?? []) graph.addInput(input);
    if (built.inputs?.length) result.extraInputs.push(...built.inputs);
    running.push(...built.filters);
    return true;
  };

  if (profile.pack.grade) {
    try {
      place(profile.pack.grade, 0, D, "subtle");
    } catch {
      skipped.push({ id: profile.pack.grade, reason: "grade-failed" });
    }
  }
  for (const a of accepted) {
    try {
      const ok = place(a.defId, a.start, a.duration, a.intensity, a.text);
      if (ok) result.placed.push({ defId: a.defId, start: a.start, duration: a.duration, intensity: a.intensity, trigger: a.trigger });
    } catch {
      skipped.push({ id: a.defId, reason: "build-failed" });
    }
  }

  if (running.length > 0) {
    result.outLabel = graph.chain(fromLabel, running);
  }
  result.requires = [...requires];

  if (opts.assCues?.length) {
    result.ass = buildAss({
      cues: opts.assCues,
      style: profile.pack.captionStyle,
      W: opts.ctx.W,
      H: opts.ctx.H,
      accent: opts.ctx.accent,
      ink: opts.ctx.ink,
    });
  }
  return result;
}

/** Preview render helper: low-res scale + clamped 5–10s span. */
export function previewPlan(duration: number, W: number, H: number, maxW = 360): { scale: string; seconds: number } {
  const k = Math.min(1, maxW / W);
  const pw = Math.round((W * k) / 2) * 2;
  const ph = Math.round((H * k) / 2) * 2;
  return { scale: `scale=${pw}:${ph}`, seconds: Math.min(10, Math.max(5, Math.min(duration, 10))) };
}
