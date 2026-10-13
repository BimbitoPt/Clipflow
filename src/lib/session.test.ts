import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./storage";
import type { Profile } from "./profile";
import {
  readSession,
  readWordTiming,
  validSceneChoice,
  writeSession,
  writeWordTiming,
  SESSION_KEY,
  WORDTIMES_KEY,
  type SessionSnapshot,
} from "./session";

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const PROFILE: Profile = {
  niche: "web design",
  audience: "creators",
  offer: "fixed-price site",
  tone: "direct",
  proof: "ships in two weeks",
};

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    idea: "ship a site in two weeks",
    scriptOverrides: {},
    sceneChoices: Array.from({ length: 5 }, () => ({ kind: "auto-ai" })),
    captionMode: "auto",
    captionOverrides: {},
    voiceOn: true,
    visualEffect: "none",
    platform: "tiktok",
    credit: false,
    pack: "mstudio",
    ...overrides,
  };
}

describe("validSceneChoice", () => {
  it.each(["auto-ai", "ai", "stock", "upload", "native", "generated"])("accepts kind %s", (kind) => {
    expect(validSceneChoice({ kind })).toBe(true);
  });

  it("rejects unknown kinds and non-objects", () => {

describe("readSession", () => {
  it("returns null when nothing is stored", () => {
    expect(readSession(memoryStore())).toBeNull();
  });

  it("round-trips a written snapshot", () => {
    const store = memoryStore();
    const snap = snapshot({ idea: "hello world", voiceOn: false, credit: true, pack: "clipflow" });
    writeSession(store, snap);
    expect(readSession(store)).toEqual(snap);
  });

  it("rejects a wrong version", () => {
    const store = memoryStore();
    store.setItem(SESSION_KEY, JSON.stringify({ version: 2, idea: "x" }));
    expect(readSession(store)).toBeNull();
  });

  it("rejects a sceneChoices array that is not exactly five valid choices", () => {
    const store = memoryStore();
    const bad = { ...snapshot(), sceneChoices: Array.from({ length: 4 }, () => ({ kind: "auto-ai" })) };
    store.setItem(SESSION_KEY, JSON.stringify({ version: 1, ...bad }));
    expect(readSession(store)).toBeNull();
  });

  it("rejects an invalid captionMode", () => {
    const store = memoryStore();
    store.setItem(SESSION_KEY, JSON.stringify({ version: 1, ...snapshot(), captionMode: "karaoke" }));
    expect(readSession(store)).toBeNull();
  });

  it("rejects malformed JSON instead of throwing", () => {
    const store = memoryStore();
    store.setItem(SESSION_KEY, "{not json");
    expect(readSession(store)).toBeNull();
  });

  it("defaults platform and pack when they are unknown", () => {

describe("readWordTiming", () => {
  const cue = { span: [0, 2], words: null };

  it("returns cues on an exact idea+profile match", () => {
    const store = memoryStore();
    store.setItem(
      WORDTIMES_KEY,
      JSON.stringify({ idea: "ship a site in two weeks", profile: PROFILE, cues: [cue], windows: [{ start: 0, end: 2 }], total: 2, assets: [null] }),
    );
    const result = readWordTiming(store, "ship a site in two weeks", PROFILE)!;
    expect(result.cues).toEqual([cue]);
    expect(result.windows).toEqual([{ start: 0, end: 2 }]);
    expect(result.total).toBe(2);
    expect(result.assets).toEqual([null]);
  });

  it("returns null on an idea mismatch", () => {
    const store = memoryStore();
    store.setItem(WORDTIMES_KEY, JSON.stringify({ idea: "other", profile: PROFILE, cues: [cue] }));
    expect(readWordTiming(store, "ship a site in two weeks", PROFILE)).toBeNull();
  });

  it("returns null on a profile mismatch", () => {
    const store = memoryStore();
    store.setItem(WORDTIMES_KEY, JSON.stringify({ idea: "ship a site in two weeks", profile: { ...PROFILE, tone: "playful" }, cues: [cue] }));
    expect(readWordTiming(store, "ship a site in two weeks", PROFILE)).toBeNull();
  });

  it("returns null when the cues are malformed", () => {
    const store = memoryStore();
    store.setItem(WORDTIMES_KEY, JSON.stringify({ idea: "ship a site in two weeks", profile: PROFILE, cues: [{ span: [2, 1], words: null }] }));
    expect(readWordTiming(store, "ship a site in two weeks", PROFILE)).toBeNull();
  });

  it("drops a windows array whose length disagrees with the cues", () => {
    const store = memoryStore();
    store.setItem(
      WORDTIMES_KEY,
      JSON.stringify({ idea: "ship a site in two weeks", profile: PROFILE, cues: [cue], windows: [{ start: 0, end: 1 }, { start: 1, end: 2 }] }),
    );
    expect(readWordTiming(store, "ship a site in two weeks", PROFILE)!.windows).toBeNull();
  });

  it("drops a non-positive total", () => {
    const store = memoryStore();
    store.setItem(WORDTIMES_KEY, JSON.stringify({ idea: "ship a site in two weeks", profile: PROFILE, cues: [cue], total: 0 }));
    expect(readWordTiming(store, "ship a site in two weeks", PROFILE)!.total).toBeNull();
  });

  it("returns null when storage read throws", () => {
    const throwing: KeyValueStore = {
      getItem() {
        throw new Error("storage disabled");
      },
      setItem() {},
      removeItem() {},
    };
    expect(readWordTiming(throwing, "ship a site in two weeks", PROFILE)).toBeNull();
  });
});

describe("writeWordTiming", () => {
  it("stores a raw sidecar and removes it when passed null", () => {
    const store = memoryStore();
    writeWordTiming(store, "raw-sidecar");
    expect(store.getItem(WORDTIMES_KEY)).toBe("raw-sidecar");
    writeWordTiming(store, null);
    expect(store.getItem(WORDTIMES_KEY)).toBeNull();
  });
});
    const store = memoryStore();
    store.setItem(SESSION_KEY, JSON.stringify({ version: 1, ...snapshot(), platform: "myspace", pack: "nope" }));
    const result = readSession(store)!;
    expect(result.platform).toBe("tiktok");
    expect(result.pack).toBe("mstudio");
  });
});
    expect(validSceneChoice({ kind: "bogus" })).toBe(false);
    expect(validSceneChoice(null)).toBe(false);
    expect(validSceneChoice("auto-ai")).toBe(false);
  });
});