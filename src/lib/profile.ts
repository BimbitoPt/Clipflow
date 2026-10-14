export interface Profile { niche: string; audience: string; offer: string; tone: string; proof: string; }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export const KEY = "clipflow.profile";
export const MSTUDIO_PROFILE: Profile = {
  niche: "web design, development and AI automation studio",
  audience: "creators, personal brands and digital businesses",
  offer: "fixed-price Speed Site, Brand + Website System and AI Automation Build",
  tone: "Direct, confident, zero fluff",
  proof: "ships in 1-2 weeks, documented handoff, you own the code",
};
export function isProfile(v: unknown): v is Profile {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return ["niche", "audience", "offer", "tone", "proof"].every((k) => typeof o[k] === "string" && (o[k] as string).trim().length > 0);
}
export function loadProfile(storage: StorageLike): Profile | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProfile(parsed) ? parsed : null;
  } catch { return null; }
}
/**
 * Persist the profile. Returns `false` instead of throwing when storage is
 * unavailable (quota, privacy mode) so callers report the outcome without
 * using exceptions for control flow.
 */
export function saveProfile(storage: StorageLike, profile: Profile): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

/** Load the persisted profile, falling back to the default when absent or unreadable. */
export function loadInitialProfile(storage: StorageLike): Profile {
  try {
    return loadProfile(storage) ?? MSTUDIO_PROFILE;
  } catch {
    return MSTUDIO_PROFILE;
  }
}
