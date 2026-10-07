import { registerEffect } from "../registry";
import { counterUp, lowerThird, trendSteps } from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

const NICHE = "finance";

function def(d: Omit<EffectDef, "niches" | "scope">): void {
  registerEffect({ ...d, niches: [NICHE], scope: "chain" });
}

def({
  id: "lower-third",
  name: "Lower third",
  category: "text",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Clean stat plate with accent bar.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: lowerThird({ p, ctx }) }),
});

def({
  id: "counter-up",
  name: "Counter up",
  category: "text",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Animated number counter (deterministic range from seed).",
  build: (p: BuildParams, ctx: FxCtx) => ({
    filters: counterUp({ p, ctx }, 0, 100 + Math.floor(p.variant * 900), "$"),
  }),
});

def({
  id: "trend-steps",
  name: "Trend steps",
  category: "overlay",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Rising staircase bars.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: trendSteps({ p, ctx }) }),
});
