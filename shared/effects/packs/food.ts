import { registerEffect } from "../registry";
import { softVignette, stickerPop } from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

const NICHE = "food";

function def(d: Omit<EffectDef, "niches" | "scope">): void {
  registerEffect({ ...d, niches: [NICHE], scope: "chain" });
}

def({
  id: "sticker-pop",
  name: "Sticker pop",
  category: "sticker",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Starred word sticker pop.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: stickerPop({ p, ctx }) }),
});

def({
  id: "soft-vignette",
  name: "Soft vignette",
  category: "color",
  intensities: ["subtle"],
  heavy: false,
  describe: "Soft lifestyle vignette (full clip).",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: softVignette({ p, ctx }) }),
});
