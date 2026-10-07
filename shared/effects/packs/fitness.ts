import { registerEffect } from "../registry";
import { kineticCaption } from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

const NICHE = "fitness";

function def(d: Omit<EffectDef, "niches" | "scope">): void {
  registerEffect({ ...d, niches: [NICHE], scope: "chain" });
}

// Fitness leans on universal punch-zoom + beat-flash plus its grade;
// its signature addition is the bouncing kinetic caption.
def({
  id: "kinetic-caption",
  name: "Kinetic caption",
  category: "text",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Bold bouncing caption pop.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: kineticCaption({ p, ctx }) }),
});
