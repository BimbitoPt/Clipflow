/**
 * Clipflow product-demo plan (bundled by scripts/render-product-demo.mjs).
 * 24s, 4 board cells, product-demo pack, karaoke ASS captions,
 * pinned CTA endcap. Deterministic for a fixed seed.
 */
import {
  NICHE_PROFILES,
  nicheProfile,
  composeTimeline,
  checkFilters,
  FilterGraph,
  type FxCtx,
} from "../shared/effects/packs/index";

export const DEMO = {
  W: 720,
  H: 1280,
  fps: 30,
  duration: 24,
  level: "medium" as const,
  seed: 7,
  accent: "#CFFF47",
  nicheId: "product-demo",
  segments: [
    { src: "outputs/boards/cells/board-idea.png", dur: 6, kind: "image" as const },
    { src: "outputs/boards/cells/board-script.png", dur: 6, kind: "image" as const },
    { src: "outputs/boards/cells/board-visuals.png", dur: 6, kind: "image" as const },
    { src: "outputs/boards/cells/board-export.png", dur: 6, kind: "image" as const },
  ],
  cues: {
    cuts: [6, 12, 18],
    beats: [1.5, 3.5, 5.5, 7.5, 9.5, 11.5, 13.5, 15.5, 17.5, 19.5, 21.5, 23],
    keywords: [
      { t: 8, word: "script" },
      { t: 10.5, word: "voice" },
      { t: 14.5, word: "renders" },
      { t: 20.5, word: "drafts" },
    ],
  },
  assCues: [
    { text: "Editing a 30 second short still eats two hours.", start: 0.2, end: 5.8 },
    { text: "Type one line. Clipflow writes the script, voices it, captions it.", start: 6.2, end: 11.8 },
    { text: "Local renders on your machine. No server, no keys.", start: 12.2, end: 17.8 },
    { text: "Unlimited drafts, clean 720p.", start: 17.6, end: 21.6 },
  ],
};

export function composeDemo(fontFile: string, unavailable: string[] = [], graph?: FilterGraph, fromLabel?: string) {
  const profile = nicheProfile(DEMO.nicheId, NICHE_PROFILES);
  const ctx: FxCtx = {
    W: DEMO.W,
    H: DEMO.H,
    fps: DEMO.fps,
    duration: DEMO.duration,
    accent: DEMO.accent,
    bg: "#080A0D",
    ink: "#F7F8FA",
    fontFile,
  };
  return composeTimeline({
    profile,
    duration: DEMO.duration,
    level: DEMO.level,
    seed: DEMO.seed,
    ctx,
    cues: DEMO.cues,
    assCues: DEMO.assCues,
    // Demo caption size: H/26 keeps two-line karaoke inside the 340px
    // bottom band without clipping board cards.
    assSize: Math.round(DEMO.H / 26),
    fromLabel: fromLabel ?? "[vcat]",
    unavailable: new Set(unavailable),
    // Single-backdrop fix: device-frame is a permanent scale+pad (black bars
    // full duration, no window gating) — it stacked under the CTA endcap
    // full-cover, producing the "2 backgrounds" look. Full-bleed footage +
    // one endcap only.
    // Boards fix: stills carry their own UI/text — camera moves (follow-zoom,
    // whip-pan), wipes (before-after), pointer ripples and corner ticks crop
    // or fight the board copy. Inline keyword pops (typewriter/stat-pop/
    // kinetic-caption/callout) also sit on board copy. Keep CTA endcap only;
    // ASS karaoke captions carry the narration in the bottom safe zone.
    disabled: new Set(["device-frame", "follow-zoom", "whip-pan", "before-after", "click-ripple", "corner-ticks", "typewriter", "stat-pop", "kinetic-caption", "callout-box"]),
    ...(graph ? { graph } : {}),
  });
}

export { FilterGraph, checkFilters };
