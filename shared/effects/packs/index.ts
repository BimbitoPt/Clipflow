import "./universal";
import "./grades";
import "./editing";
import "./tech";
import "./gaming";
import "./finance";
import { getEffect } from "../registry";

export { NICHE_PROFILES, loadNicheProfiles, nicheProfile, nicheIds } from "../niches";
export { detectNiche, keywordScorer } from "../scorer";
export { composeTimeline, mulberry32, previewPlan } from "../composer";
export { FilterGraph, checkFilters, escText, escAssPath, formatCommand } from "../graph";
export { getEffect, listEffects, effectsForNiche, registerEffect, clearRegistry } from "../registry";
export { buildAss } from "../ass";
export type * from "../types";

/**
 * Cross-check: every effect/grade/transition id referenced by the profiles
 * must be registered. Run in tests and before renders.
 */
export function validatePackRefs(
  profiles: { id: string; pack: { effects: { id: string }[]; grade?: string; transition?: string } }[],
): string[] {
  const errors: string[] = [];
  for (const profile of profiles) {
    const ids = [
      ...profile.pack.effects.map((e) => e.id),
      ...(profile.pack.grade ? [profile.pack.grade] : []),
      ...(profile.pack.transition ? [profile.pack.transition] : []),
    ];
    for (const id of ids) {
      try {
        getEffect(id);
      } catch {
        errors.push(`niche '${profile.id}' references unknown effect '${id}'`);
      }
    }
  }
  return errors;
}
