import { registerEffect } from "../registry";
import { arrowNote, calloutBox, keyPop, stepCounter } from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

const NICHE = "edu";

function def(d: Omit<EffectDef, "niches" | "scope">): void {
  registerEffect({ ...d, niches: [NICHE], scope: "chain" });
}

def({
  id: "callout-box",
  name: "Callout box",
  category: "overlay",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Blinking highlight-box callout.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: calloutBox({ p, ctx }) }),
});

def({
  id: "arrow-note",
  name: "Arrow note",
  category: "text",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Arrow annotation with label.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: arrowNote({ p, ctx }) }),
});

def({
  id: "step-counter",
  name: "Step counter",
  category: "text",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "STEP n/3 chip (deterministic from seed).",
  build: (p: BuildParams, ctx: FxCtx) => ({
    filters: stepCounter({ p, ctx }, 1 + Math.floor(p.variant * 3), 3),
  }),
});

def({
  id: "key-pop",
  name: "Key-term pop",
  category: "text",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Key-term plate pop-in.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: keyPop({ p, ctx }) }),
});
