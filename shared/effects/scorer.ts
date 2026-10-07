import type { NicheProfile, NicheScorer } from "./types";

/** Escape for RegExp construction. */
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Default keyword scorer: counts whole-word / whole-phrase hits
 * (case-insensitive), +1 per keyword occurrence. Longer phrases score the
 * same as single words — keep it simple and predictable.
 */
export const keywordScorer: NicheScorer = (text, profile) => {
  const hay = ` ${text.toLowerCase()} `;
  let score = 0;
  for (const kw of profile.keywords) {
    const k = kw.toLowerCase().trim();
    if (!k) continue;
    // Word-boundary match on both ends so "edit" doesn't match "credit".
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escRe(k)}(?![\\p{L}\\p{N}])`, "gu");
    const hits = hay.match(re);
    if (hits) score += hits.length;
  }
  return score;
};

export interface DetectInput {
  /** Explicit user override (UI/config). Wins when it names a known niche. */
  overrideId?: string;
  /** App/project description field. Weighted 2x. */
  description?: string;
  /** Transcript or title text. */
  transcript?: string;
  title?: string;
  profiles: NicheProfile[];
  /** Pluggable: swap in an LLM call later with the same signature. */
  scorer?: NicheScorer;
}

export interface DetectResult {
  id: string;
  score: number;
  /** Which input won: override | scored | fallback. */
  method: "override" | "scored" | "fallback";
}

/**
 * Niche resolution, priority order:
 * 1. user override, 2. description (2x) + transcript + title scoring,
 * 3. universal fallback.
 */
export function detectNiche(input: DetectInput): DetectResult {
  const scorer = input.scorer ?? keywordScorer;
  if (input.overrideId && input.profiles.some((p) => p.id === input.overrideId)) {
    return { id: input.overrideId, score: Number.POSITIVE_INFINITY, method: "override" };
  }
  let best: DetectResult = { id: "universal", score: 0, method: "fallback" };
  for (const profile of input.profiles) {
    if (profile.id === "universal") continue;
    const score =
      2 * scorer(input.description ?? "", profile) +
      scorer(input.transcript ?? "", profile) +
      scorer(input.title ?? "", profile);
    if (score > best.score) best = { id: profile.id, score, method: "scored" };
  }
  return best;
}
