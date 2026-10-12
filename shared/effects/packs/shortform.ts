import { registerEffect } from "../registry";
import { vhsStamp } from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

function def(d: Omit<EffectDef, "niches" | "scope">): void {
  registerEffect({ ...d, niches: ["shortform"], scope: "chain" });
}

def({
  id: "vhs-stamp",
  name: "VHS stamp",
  category: "overlay",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Camcorder PLAY + running timecode stamp.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: vhsStamp({ p, ctx }) }),
});
