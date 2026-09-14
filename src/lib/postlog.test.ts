import { describe, expect, it } from "vitest";
import { KEY, appendLog, loadLog, saveLog, type PostEntry } from "./postlog";
import type { StorageLike } from "./profile";

function memStorage(seed: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
  };
}

const E1: PostEntry = {
  id: "p1",
  dateISO: "2026-09-14T00:00:00.000Z",
  client: "mstudio",
  idea: "idea one",
  platform: "tiktok",
  status: "queued",
};

const E2: PostEntry = {
  id: "p2",
  dateISO: "2026-09-14T01:00:00.000Z",
  client: "mstudio",
  idea: "idea two",
  platform: "reels",
  status: "posted",
};

describe("postlog", () => {
  it("starts empty and round-trips through storage", () => {
    const s = memStorage();
    expect(loadLog(s)).toEqual([]);
    saveLog(s, [E1]);
    expect(loadLog(s)).toEqual([E1]);
  });

  it("appends without clobbering existing entries", () => {
    const s = memStorage();
    expect(appendLog(s, E1)).toEqual([E1]);
    expect(appendLog(s, E2)).toEqual([E1, E2]);
    expect(loadLog(s)).toEqual([E1, E2]);
  });

  it("returns [] on corrupt json or wrong shapes", () => {
    expect(loadLog(memStorage({ [KEY]: "{nope" }))).toEqual([]);
    expect(loadLog(memStorage({ [KEY]: "{}" }))).toEqual([]);
    expect(loadLog(memStorage({ [KEY]: "\"str\"" }))).toEqual([]);
    expect(loadLog(memStorage({ [KEY]: JSON.stringify({ id: "x" }) }))).toEqual([]);
  });

  it("rejects invalid appends with E_ prefix", () => {
    const s = memStorage();
    const bad = { ...E1, status: "nope" } as unknown as PostEntry;
    expect(() => appendLog(s, bad)).toThrow(/E_POSTLOG_INVALID/);
    expect(loadLog(s)).toEqual([]);
  });
});
