import type { StorageLike } from "./profile";

export type PostStatus = "queued" | "posted" | "failed";
export interface PostEntry { id: string; dateISO: string; client: string; idea: string; platform: string; status: PostStatus; }

export const KEY = "clipflow.postlog";

export function isPostEntry(v: unknown): v is PostEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  for (const k of ["id", "dateISO", "client", "idea", "platform"]) {
    if (typeof o[k] !== "string" || (o[k] as string).trim().length === 0) return false;
  }
  return o["status"] === "queued" || o["status"] === "posted" || o["status"] === "failed";
}

export function loadLog(storage: StorageLike): PostEntry[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPostEntry);
  } catch { return []; }
}

export function saveLog(storage: StorageLike, entries: PostEntry[]): void {
  storage.setItem(KEY, JSON.stringify(entries));
}

export function appendLog(storage: StorageLike, entry: PostEntry): PostEntry[] {
  if (!isPostEntry(entry)) throw new Error("E_POSTLOG_INVALID: not a PostEntry");
  const next = [...loadLog(storage), entry];
  saveLog(storage, next);
  return next;
}
