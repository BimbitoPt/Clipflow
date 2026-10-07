import { registerEffect } from "../registry";
import { glitchBurst, razorFlash, recDot, timelineBar } from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

const NICHE = "editing";

function def(d: Omit<EffectDef, "niches" | "scope">): void {
  registerEffect({ ...d, niches: [NICHE], scope: "chain" });
}

def({
  id: "timeline-bar",
  name: "Timeline bar",
  category: "overlay",
  intensities: ["subtle"],
  heavy: false,
  describe: "Mock NLE timeline: track, fill, playhead, cut ticks.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: timelineBar({ p, ctx }, ctx.duration) }),
});

def({
  id: "razor-flash",
  name: "Razor cut flash",
  category: "transition",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Cut flash with a vertical razor line sweep.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: razorFlash({ p, ctx }) }),
});

def({
  id: "glitch-burst",
  name: "Glitch burst",
  category: "transition",
  intensities: ["medium", "hype"],
  heavy: true,
  describe: "RGB-split + noise glitch transition.",
  build: (p: BuildParams, ctx: FxCtx) => {
    const built = glitchBurst({ p, ctx });
    return { filters: built.filters, requires: built.requires };
  },
});

def({
  id: "rec-dot",
  name: "REC dot",
  category: "overlay",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Blinking REC indicator, top-right.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: recDot({ p, ctx }) }),
});
