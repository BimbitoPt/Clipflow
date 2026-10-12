import { registerEffect } from "../registry";
import {
  beforeAfter,
  ctaCard,
  deviceFrame,
  followZoom,
  statPop,
} from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

const NICHE = "product-demo";

function def(d: Omit<EffectDef, "niches" | "scope">): void {
  registerEffect({ ...d, niches: [NICHE], scope: "chain" });
}

def({
  id: "follow-zoom",
  name: "Follow zoom",
  category: "camera",
  intensities: ["subtle", "medium"],
  heavy: false,
  describe: "Smooth zoom into a seeded point with drift (cursor-follow stand-in).",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: followZoom({ p, ctx }) }),
});

def({
  id: "device-frame",
  name: "Device frame",
  category: "overlay",
  intensities: ["subtle"],
  heavy: false,
  describe: "Shrink onto black with accent border (2.5D mockup).",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: deviceFrame({ p, ctx }) }),
});

def({
  id: "before-after",
  name: "Before/after split",
  category: "overlay",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Desaturated-before wipe with divider and labels.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: beforeAfter({ p, ctx }) }),
});

def({
  id: "stat-pop",
  name: "Stat pop",
  category: "text",
  intensities: ["medium", "hype"],
  heavy: false,
  describe: "Big quantified claim pop with plate.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: statPop({ p, ctx }) }),
});

def({
  id: "cta-card",
  name: "CTA end card",
  category: "text",
  intensities: ["medium"],
  heavy: false,
  describe: "Full-cover call-to-action exit frame.",
  build: (p: BuildParams, ctx: FxCtx) => ({ filters: ctaCard({ p, ctx }) }),
});
