import { registerEffect } from "../registry";
import { crtLines, hitmarker, rgbSplit, scorePop, shake, whipPan } from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

const NICHE = "gaming";

function def(d: Omit<EffectDef, "niches" | "scope">): void {
  registerEffect({ ...d, niches: [NICHE], scope: "chain" });
}

def({
  id: "screen-shake",
  name: "Screen shake",
  category: "camera",
  intensities: ["medium", "hype"],
  heavy: true,
  describe: "Impact shake burst.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: shake({ p, ctx }) }),
});

def({
  id: "rgb-split",
  name: "RGB split",
  category: "color",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Chromatic aberration burst.",
  build: (p: BuildParams, ctx: FxCtx) => {
    const built = rgbSplit({ p, ctx });
    return { filters: built.filters, requires: built.requires };
  },
});

def({
  id: "hitmarker",
  name: "Hitmarker",
  category: "sticker",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Hitmarker × + impact flash.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: hitmarker({ p, ctx }) }),
});

def({
  id: "score-pop",
  name: "Score pop",
  category: "text",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Growing, rising score pop-up.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: scorePop({ p, ctx }) }),
});

def({
  id: "crt-lines",
  name: "CRT scanlines",
  category: "overlay",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Full-clip VHS/CRT scanlines.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: crtLines({ p, ctx }) }),
});

def({
  id: "whip-pan",
  name: "Whip pan",
  category: "transition",
  intensities: ["medium", "hype"],
  heavy: true,
  describe: "Fast lateral whip transition.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: whipPan({ p, ctx }, p.variant >= 0.5 ? 1 : -1) }),
});
