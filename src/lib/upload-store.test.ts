import { describe, expect, it } from "vitest";
import { deleteUpload, gcUploads, loadUploadBlob, readUploadIndex, saveUpload, touchUpload, type UploadDir } from "./upload-store";

/** In-memory OPFS stand-in: Map id -> bytes. */
function fakeDir(): UploadDir & { files: Map<string, Blob> } {
  const files = new Map<string, Blob>();
  return {
    files,
    async getFileHandle(name: string, options?: { create?: boolean }) {
      const existing = files.get(name);
      if (!existing && !options?.create) throw new Error("NotFoundError");
      return {
        async getFile() {
          const blob = files.get(name);
          if (!blob) throw new Error("NotFoundError");
          return blob;
        },
        async createWritable() {
          let pending: Blob | null = null;
          return {
            async write(data: Blob) {
              pending = data;
            },
            async close() {
              if (pending) files.set(name, pending);
            },
          };
        },
      };
    },
    async removeEntry(name: string) {
      if (!files.has(name)) throw new Error("NotFoundError");
      files.delete(name);
    },
  };
}

describe("upload-store", () => {
  it("round-trips bytes through save and load", async () => {
    const dir = fakeDir();
    const blob = new Blob(["image-bytes"], { type: "image/png" });
    expect(await saveUpload("abc-123", blob, dir)).toBe(true);
    const back = await loadUploadBlob("abc-123", dir);
    expect(back).not.toBeNull();
    expect(await back!.text()).toBe("image-bytes");
    expect(back!.type).toBe("image/png");
  });

  it("returns null for missing uploads without throwing", async () => {
    const dir = fakeDir();
    expect(await loadUploadBlob("nope", dir)).toBeNull();
  });

  it("deletes persisted uploads and never throws on eviction", async () => {
    const dir = fakeDir();
    await saveUpload("gone", new Blob(["x"]), dir);
    await deleteUpload("gone", dir);
    expect(await loadUploadBlob("gone", dir)).toBeNull();
    await deleteUpload("already-gone", dir);
  });

  it("rejects unsafe ids", async () => {
    const dir = fakeDir();
    expect(await saveUpload("../evil", new Blob(["x"]), dir)).toBe(false);
    expect(await loadUploadBlob("../evil", dir)).toBeNull();
    await deleteUpload("../evil", dir);
    expect(dir.files.size).toBe(0);
  });

  it("collects uploads untouched for 30 days and keeps the rest", async () => {
    const dir = fakeDir();
    const backing = new Map<string, string>();
    const store = {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
    };
    const now = 1_700_000_000_000;
    await saveUpload("fresh", new Blob(["f"]), dir);
    await saveUpload("stale", new Blob(["s"]), dir);
    touchUpload("fresh", now, store);
    touchUpload("stale", now - 31 * 24 * 3600 * 1000, store);
    const removed = await gcUploads(30 * 24 * 3600 * 1000, now, store, dir);
    expect(removed).toEqual(["stale"]);
    expect(await loadUploadBlob("fresh", dir)).not.toBeNull();
    expect(await loadUploadBlob("stale", dir)).toBeNull();
    expect(readUploadIndex(store)).toEqual({ fresh: now });
  });

  it("ignores corrupt index data", () => {
    const backing = new Map<string, string>([["clipflow.upload-index", "not-json{{{"]]);
    const store = {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
    };
    expect(readUploadIndex(store)).toEqual({});
  });
});
