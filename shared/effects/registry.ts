import type { EffectDef } from "./types";

const REGISTRY = new Map<string, EffectDef>();

/** Register an effect. Duplicate ids throw (fail fast on copy-paste). */
export function registerEffect(def: EffectDef): void {
  if (REGISTRY.has(def.id)) throw new Error(`E_FX_DUP: effect '${def.id}' already registered`);
  REGISTRY.set(def.id, def);
}

export function getEffect(id: string): EffectDef {
  const def = REGISTRY.get(id);
  if (!def) throw new Error(`E_FX_UNKNOWN: effect '${id}'`);
  return def;
}

export function listEffects(): EffectDef[] {
  return [...REGISTRY.values()];
}

/** Effects eligible for a niche: niche-tagged plus universal. */
export function effectsForNiche(nicheId: string): EffectDef[] {
  return listEffects().filter((d) => d.niches.includes(nicheId) || d.niches.includes("universal"));
}

/** Test/embedding escape hatch: clear the registry. */
export function clearRegistry(): void {
  REGISTRY.clear();
}
