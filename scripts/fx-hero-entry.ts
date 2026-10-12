/**
 * Hero-loop FX entry (bundled by scripts/render-hero-loop.mjs).
 * Composes the editing-pack motion graphics for the 15s silent hero:
 * punch zooms on beats, razor/glitch transitions on cuts, kinetic
 * caption pops on keyword hits. Chrome (top bar, progress) stays in the
 * hero script, so those defs are disabled here.
 */
import {
  NICHE_PROFILES,
  nicheProfile,
  composeTimeline,
  type FxCtx,
} from "../shared/effects/packs/index";

export { checkFilters } from "../shared/effects/packs/index";

export interface HeroFxOpts {
  duration: number;
  level: "subtle" | "medium" | "hype";
  seed: number;
  W: number;
  H: number;
  fps: number;
  accent: string;
  fontFile: string;
  unavailable?: string[];
}

export function composeHeroFx(opts: HeroFxOpts) {
  const profiles = NICHE_PROFILES;
  const profile = nicheProfile("editing", profiles);
  const ctx: FxCtx = {
    W: opts.W,
    H: opts.H,
    fps: opts.fps,
    duration: opts.duration,
    accent: opts.accent,
    bg: "#080A0D",
    ink: "#F7F8FA",
    fontFile: opts.fontFile,
  };
  // No keyword hits: the story captions already karaoke the same words,
  // and a second pop on top reads as clutter, not emphasis.
  const cues = {
    cuts: [2.5, 5, 8, 11],
    beats: [0.2, 1.4, 2.7, 3.9, 5.2, 6.5, 8.2, 9.5, 11.2, 13],
    keywords: [] as { t: number; word: string }[],
  };
  return composeTimeline({
    profile,
    duration: opts.duration,
    level: opts.level,
    seed: opts.seed,
    ctx,
    cues,
    fromLabel: "[base]",
    disabled: ["progress-bar", "timeline-bar"],
    unavailable: new Set(opts.unavailable ?? []),
  });
}
