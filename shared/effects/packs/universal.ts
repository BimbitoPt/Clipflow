import { registerEffect } from "../registry";
import { beatFlash, captionPop, flashCut, punchZoom, progressBar, shake, softFade, slowPush } from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

function def(d: EffectDef): void {
  registerEffect(d);
}

const uni = (d: Omit<EffectDef, "niches" | "scope">): void =>
  def({ ...d, niches: ["universal"], scope: "chain" });

uni({
  id: "punch-zoom",
  name: "Punch-in zoom",
  category: "camera",
  intensities: ["subtle", "medium", "hype"],
  heavy: false,
  describe: "0.4s zoom punch on beats.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: punchZoom({ p, ctx }) }),
});

uni({
  id: "screen-shake-base",
  name: "Shake (base)",
  category: "camera",
  intensities: ["medium", "hype"],
  heavy: true,
  describe: "Shake primitive shared by niche packs.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: shake({ p, ctx }) }),
});

uni({
  id: "flash-cut",
  name: "Flash cut",
  category: "transition",
  intensities: ["subtle", "medium", "hype"],
  heavy: false,
  describe: "White flash in/out transition.",
  build: (p: BuildParams) => ({ filters: flashCut({ p }) }),
});

uni({
  id: "beat-flash",
  name: "Beat flash",
  category: "sfx-sync",
  intensities: ["subtle", "medium", "hype"],
  heavy: false,
  describe: "Single short flash on a beat.",
  build: (p: BuildParams) => ({ filters: beatFlash({ p }) }),
});

uni({
  id: "soft-fade",
  name: "Soft fade",
  category: "transition",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Gentle fade in/out transition.",
  build: (p: BuildParams) => ({ filters: softFade({ p }) }),
});

uni({
  id: "slow-push",
  name: "Slow push",
  category: "camera",
  intensities: ["subtle"],
  heavy: false,
  describe: "Full-clip slow push-in (window ignored, uses clip duration).",
  build: (p: BuildParams, ctx: FxCtx) => ({
    filters: slowPush({ p: { ...p, start: 0, duration: ctx.duration }, ctx }),
  }),
});

uni({
  id: "progress-bar",
  name: "Progress bar",
  category: "overlay",
  intensities: ["subtle"],
  heavy: false,
  describe: "Full-clip bottom progress bar (window ignored).",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: progressBar({ p, ctx }, ctx.duration) }),
});

uni({
  id: "caption-pop",
  name: "Caption pop",
  category: "text",
  intensities: ["subtle", "medium", "hype"],
  heavy: false,
  describe: "Word pop in the caption zone.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: captionPop({ p, ctx }) }),
});
