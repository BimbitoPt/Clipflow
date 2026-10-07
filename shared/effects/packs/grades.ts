import { registerEffect } from "../registry";
import { gradeEq, vignette, warmGrade } from "../fx";
import type { BuildParams, EffectDef, FxCtx } from "../types";

/** Full-duration color looks, one per niche (+universal clean). */

function grade(
  id: string,
  name: string,
  niches: string[],
  filters: (p: BuildParams, ctx: FxCtx) => string[],
): void {
  const def: EffectDef = {
    id,
    name,
    category: "color",
    niches,
    intensities: ["subtle"],
    heavy: false,
    scope: "chain",
    describe: `Full-duration ${name} grade.`,
    build: (p, ctx) => ({ filters: filters(p, ctx) }),
  };
  registerEffect(def);
}

grade("grade-clean", "Clean", ["universal", "editing", "edu"], (p, ctx) => [
  ...gradeEq({ p, ctx }, "contrast=1.06:saturation=1.08"),
]);

grade("grade-neon", "Neon", ["tech"], (p, ctx) => [
  ...gradeEq({ p, ctx }, "contrast=1.08:saturation=1.25"),
  "colorbalance=bs=.15:bm=.08",
]);

grade("grade-arcade", "Arcade", ["gaming"], (p, ctx) => [
  ...gradeEq({ p, ctx }, "contrast=1.15:saturation=1.35"),
  ...vignette({ p, ctx }),
]);

grade("grade-gold", "Gold", ["finance"], (p, ctx) => [
  "colorbalance=rs=.18:gs=.08:bs=-.12:rm=.08:bm=-.06",
  ...gradeEq({ p, ctx }, "contrast=1.07:saturation=1.05"),
]);

grade("grade-punch", "Punch", ["fitness"], (p, ctx) => [
  ...gradeEq({ p, ctx }, "contrast=1.22:saturation=1.30"),
]);

grade("grade-warm", "Warm", ["food"], (p, ctx) => warmGrade({ p, ctx }));
