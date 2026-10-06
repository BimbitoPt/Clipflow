/**
 * Durable storage for browser-uploaded scene media (OPFS).
 *
 * Uploads used to live only in an in-memory Map: reloading the tab lost the
 * media while scene choices still referenced the ids, and a `.clipflow`
 * project opened on another machine silently lost its footage. This module
 * persists upload bytes to the Origin Private File System so uploads survive
 * reloads on the same machine; App keeps the decoded bitmaps as a memory
 * cache on top and rehydrates from here on demand.
 *
 * Scope: same-machine durability. True cross-machine portability for
 * uploads (embedding bytes in the project file) is out of scope — desktop
 * native imports are path-based and already portable that way.
 */

const DIR = "clipflow-uploads";
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Minimal OPFS surface we use — structural, so fakes satisfy it in tests. */
export interface UploadFile {
  getFile(): Promise<Blob>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}
export interface UploadDir {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<UploadFile>;
  removeEntry(name: string): Promise<void>;
}

function validId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function uploadStoreAvailable(): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
  } catch {
    return false;
  }
}

async function opfsDir(): Promise<UploadDir | null> {
  if (!uploadStoreAvailable()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    // getDirectory-on-handle is OPFS-standard but missing from TS's DOM
    // lib — reach it through a structural seam instead of `any`.
    const sub = await (root as unknown as {
      getDirectory(name: string, options?: { create?: boolean }): Promise<UploadDir>;
    }).getDirectory(DIR, { create: true });
    return sub;
  } catch {
    return null;
  }
}

/** Write-through persist. Returns false when storage is unavailable/fails. */
export async function saveUpload(id: string, blob: Blob, dir?: UploadDir): Promise<boolean> {
  if (!validId(id)) return false;
  try {
    const target = dir ?? (await opfsDir());
    if (!target) return false;
    const handle = await target.getFileHandle(id, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
    return true;
  } catch {
    return false;
  }
}

/** Load persisted bytes, or null when missing/unavailable. Never throws. */
export async function loadUploadBlob(id: string, dir?: UploadDir): Promise<Blob | null> {
  if (!validId(id)) return null;
  try {
    const target = dir ?? (await opfsDir());
    if (!target) return null;
    const handle = await target.getFileHandle(id);
    return await handle.getFile();
  } catch {
    return null;
  }
}

/** Delete persisted bytes. Never throws — best-effort eviction. */
export async function deleteUpload(id: string, dir?: UploadDir): Promise<void> {
  if (!validId(id)) return;
  try {
    const target = dir ?? (await opfsDir());
    if (!target) return;
    await target.removeEntry(id);
  } catch {
    // Eviction must never break the editor.
  }
}

// --- Upload index + garbage collection -------------------------------------
// OPFS files outlive the tab, but scene-choice references don't (browser
// reload resets React state). The index tracks last-use per upload so a
// mount effect can collect files untouched for 30 days instead of leaking
// device storage one upload at a time.

const INDEX_KEY = "clipflow.upload-index";
export const UPLOAD_GC_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function keyStore(): KeyStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readUploadIndex(store: KeyStore | null = keyStore()): Record<string, number> {
  if (!store) return {};
  try {
    const raw = store.getItem(INDEX_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (validId(id) && typeof at === "number" && Number.isFinite(at)) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

export function touchUpload(id: string, now: number = Date.now(), store: KeyStore | null = keyStore()): void {
  if (!validId(id) || !store) return;
  try {
    store.setItem(INDEX_KEY, JSON.stringify({ ...readUploadIndex(store), [id]: now }));
  } catch {
    // Index is hygiene, never load-bearing.
  }
}

/** Delete files untouched for longer than maxAgeMs. Returns removed ids. */
export async function gcUploads(
  maxAgeMs: number = UPLOAD_GC_MAX_AGE_MS,
  now: number = Date.now(),
  store: KeyStore | null = keyStore(),
  dir?: UploadDir,
): Promise<string[]> {
  if (!store) return [];
  const index = readUploadIndex(store);
  const stale = Object.entries(index)
    .filter(([, at]) => now - at > maxAgeMs)
    .map(([id]) => id);
  if (!stale.length) return [];
  const target = dir ?? (await opfsDir());
  const kept: Record<string, number> = { ...index };
  for (const id of stale) {
    try {
      if (target) await target.removeEntry(id);
    } catch {
      // Missing file counts as collected.
    }
    delete kept[id];
  }
  try {
    store.setItem(INDEX_KEY, JSON.stringify(kept));
  } catch {
    // Best-effort.
  }
  return stale;
}
