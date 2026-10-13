/**
 * A get/set/remove key-value store. A superset of `profile.ts`'s `StorageLike`
 * (which only needs get/set for profile persistence) so any `KeyValueStore`
 * can be passed where a `StorageLike` is expected.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The app's single access point for `localStorage`.
 *
 * Deliberately raw (no try/catch): every caller already guards its own
 * persistence — session writes, profile saves and activation stamps each wrap
 * the call so a quota/privacy failure degrades gracefully instead of crashing.
 * Centralising it here keeps that one boundary obvious and injectable for
 * tests.
 */
export function browserStore(): KeyValueStore {
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  };
}

/**
 * The one store instance the app shares (App shell, hooks, services). Same
 * underlying `localStorage`, one place to swap in tests.
 */
export const browserStorage: KeyValueStore = browserStore();

/**
 * Crash-safe single read. Browser storage is optional: privacy settings and
 * storage failures must not crash rendering or dirty-state calculation, so a
 * throw here becomes `null` and the caller falls back to its default.
 */
export function safeStorageGet(store: KeyValueStore, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}