import type { NicheProfile } from "./types";
import defaults from "./niches.json";

function isProfile(v: unknown): v is NicheProfile {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const pack = o["pack"] as Record<string, unknown> | undefined;
  return (
    typeof o["id"] === "string" &&
    typeof o["label"] === "string" &&
    Array.isArray(o["keywords"]) &&
    typeof pack === "object" &&
    pack !== null &&
    Array.isArray(pack["effects"]) &&
    typeof pack["captionStyle"] === "string" &&
    typeof pack["pacing"] === "number"
  );
}

/**
 * Load + validate niche profiles. Adding a niche is a config-only change:
 * append an entry (id, label, keywords, pack) — no code touched.
 * Throws on the first invalid entry.
 */
export function loadNicheProfiles(raw: unknown): NicheProfile[] {
  const root = (raw as { niches?: unknown[] })?.niches;
  if (!Array.isArray(root) || root.length === 0) throw new Error("E_NICHE_EMPTY: no niches defined");
  const ids = new Set<string>();
  for (const entry of root) {
    if (!isProfile(entry)) throw new Error(`E_NICHE_INVALID: ${JSON.stringify(entry).slice(0, 80)}`);
    if (ids.has(entry.id)) throw new Error(`E_NICHE_DUP: '${entry.id}'`);
    ids.add(entry.id);
  }
  return root as NicheProfile[];
}

/** The bundled profiles. Validated once at import. */
export const NICHE_PROFILES: NicheProfile[] = loadNicheProfiles(defaults);

export function nicheProfile(id: string, profiles: NicheProfile[] = NICHE_PROFILES): NicheProfile {
  const found = profiles.find((p) => p.id === id);
  if (!found) throw new Error(`E_NICHE_UNKNOWN: '${id}'`);
  return found;
}

export function nicheIds(profiles: NicheProfile[] = NICHE_PROFILES): string[] {
  return profiles.map((p) => p.id);
}
