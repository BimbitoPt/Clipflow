import { registerEffect } from "../registry";
import { clickRipple, codeRain, gridOverlay, neonTitle, pulseBox, scanlineSweep, typewriter } from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

const NICHE = "tech";

function def(d: Omit<EffectDef, "niches" | "scope">): void {
  registerEffect({ ...d, niches: [NICHE], scope: "chain" });
}

def({
  id: "scanline-sweep",
  name: "Scanline sweep",
  category: "transition",
  intensities: ["subtle", "medium", "hype"],
  heavy: false,
  describe: "Accent scan bar travelling top to bottom.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: scanlineSweep({ p, ctx }) }),
});

def({
  id: "grid-overlay",
  name: "Grid overlay",
  category: "overlay",
  intensities: ["subtle"],
  heavy: false,
  describe: "Faint tech grid over the full clip.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: gridOverlay({ p, ctx }) }),
});

def({
  id: "click-ripple",
  name: "Click ripple",
  category: "overlay",
  intensities: ["subtle", "medium", "hype"],
  heavy: false,
  describe: "Cursor-click expanding rings at a seeded spot.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: clickRipple({ p, ctx }) }),
});

def({
  id: "neon-title",
  name: "Neon title",
  category: "text",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Neon-glow title pop.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: neonTitle({ p, ctx }) }),
});

def({
  id: "typewriter",
  name: "Typewriter",
  category: "text",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Code line revealed behind a shrinking cover bar.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: typewriter({ p, ctx }) }),
});

def({
  id: "pulse-box",
  name: "Pulse box",
  category: "overlay",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Blinking UI highlight box.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: pulseBox({ p, ctx }) }),
});

def({
  id: "code-rain",
  name: "Code rain",
  category: "overlay",
  intensities: ["subtle"],
  heavy: false,
  describe: "Faint drifting code columns (ambient tech texture).",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: codeRain({ p, ctx }) }),
});
