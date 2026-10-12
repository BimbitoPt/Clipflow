/** Core contracts for the niche-aware motion-graphics / effects system. */

export type EffectCategory =
  | "transition"
  | "overlay"
  | "text"
  | "color"
  | "camera"
  | "sticker"
  | "sfx-sync";

export type Intensity = "subtle" | "medium" | "hype";

export type EffectsLevel = "off" | "subtle" | "medium" | "hype";

/** Trigger source that placed an effect on the timeline. */
export type TriggerKind = "cut" | "beat" | "keyword" | "ambient" | "full" | "endcap";

/** Render-wide context every effect build receives. */
export interface FxCtx {
  /** Output width / height. Effects must position relative to these. */
  W: number;
  H: number;
  fps: number;
  /** Full clip duration in seconds. */
  duration: number;
  /** Niche accent color, e.g. "#CFFF47". */
  accent: string;
  bg: string;
  ink: string;
  /** Absolute fontfile path for drawtext (staging is the caller's job). */
  fontFile: string;
}

/** Parameters for one placed effect instance. */
export interface BuildParams {
  /** Start time in seconds. */
  start: number;
  /** Duration in seconds. */
  duration: number;
  intensity: Intensity;
  /** Seeded variant 0..1 for deterministic per-instance variation. */
  variant: number;
  /** Optional text (text/sticker effects). */
  text?: string;
  /** Optional accent override. */
  accent?: string;
}

/** What an effect build produces. */
export interface BuiltEffect {
  /**
   * Linear chain of video filters appended to the running stream.
   * Every time-varying filter MUST gate itself with
   * enable='between(t,start,end)' (or an alpha/t expression) so the
   * chain is a no-op outside its window.
   */
  filters: string[];
  /** Extra `-i` args (lavfi/file inputs) this effect needs. Pure-filter
   * effects leave this empty. Consumed by FilterGraph. */
  inputs?: string[];
  /** Filters this build requires (checked via `ffmpeg -filters`). */
  requires?: string[];
}

/**
 * A small self-contained effect unit.
 *
 * Scope is "chain": the fragment splices into a post-concat video chain
 * (the `[vcat]` shape in native/src/render.rs). Segment-scope effects
 * (xfade, setpts retime) need two streams / retiming and are handled by
 * the caller, not the composer.
 */
export interface EffectDef {
  id: string;
  name: string;
  category: EffectCategory;
  /** Niche ids this effect suits, or ["universal"]. */
  niches: string[];
  intensities: Intensity[];
  /** Heavy effects never overlap another heavy effect (budget rule). */
  heavy: boolean;
  scope: "chain";
  describe: string;
  build(params: BuildParams, ctx: FxCtx): BuiltEffect;
}

/** One pack entry: which effect, how strongly preferred, fixed intensity? */
export interface PackEffect {
  id: string;
  weight: number;
  intensity?: Intensity;
}

/** Niche profile: effect pack + look + pacing. */
export interface NicheProfile {
  id: string;
  label: string;
  /** Keywords for the scorer (lowercase matching). */
  keywords: string[];
  pack: {
    effects: PackEffect[];
    /** Grade effect id applied full-duration. */
    grade?: string;
    /** Transition effect id preferred on cuts. */
    transition?: string;
    /** End-cap effect id pinned to the final seconds (exit frame). */
    endcap?: string;
    /** ASS caption style id. */
    captionStyle: string;
    /** Seconds between ambient effects. */
    pacing: number;
  };
}

/** One placed effect on the timeline. */
export interface PlacedEffect {
  defId: string;
  start: number;
  duration: number;
  intensity: Intensity;
  trigger: TriggerKind;
}

/** Timing inputs the composer places effects onto. */
export interface TimelineCues {
  /** Scene-cut timestamps (seconds). */
  cuts: number[];
  /** Beat-hit timestamps (seconds). */
  beats: number[];
  /** Transcript keyword hits. */
  keywords: { t: number; word: string }[];
}

/** Pluggable scorer: higher = better niche fit. Swap for an LLM call later. */
export type NicheScorer = (text: string, profile: NicheProfile) => number;

export interface AssWord {
  text: string;
  start: number;
  end: number;
}
