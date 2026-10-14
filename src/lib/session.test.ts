import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./storage";
import type { Profile } from "./profile";
import {
  readSession,
  readTimingSidecar,
  readWordTiming,
  validSceneChoice,
  validTimingSidecar,
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
    expect(validSceneChoice({ kind: "bogus" })).toBe(false);
    expect(validSceneChoice(null)).toBe(false);
    expect(validSceneChoice("auto-ai")).toBe(false);
  });
});

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
    const store = memoryStore();
    store.setItem(SESSION_KEY, JSON.stringify({ version: 1, ...snapshot(), platform: "myspace", pack: "nope" }));
    const result = readSession(store)!;
    expect(result.platform).toBe("tiktok");
    expect(result.pack).toBe("mstudio");
  });
});

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

  it("swallows a storage failure instead of breaking project restore", () => {
    const throwing: KeyValueStore = {
      getItem: () => null,
      setItem() {
        throw new Error("quota exceeded");
      },
      removeItem() {},
    };
    expect(() => writeWordTiming(throwing, "raw-sidecar")).not.toThrow();
  });
});

describe("timing sidecar string", () => {
  const throwing: KeyValueStore = {
    getItem() {
      throw new Error("storage disabled");
    },
    setItem() {},
    removeItem() {},
  };

  it("returns the raw blob when it parses as a JSON object", () => {
    const store = memoryStore();
    const raw = JSON.stringify({ idea: "x", cues: [] });
    store.setItem(WORDTIMES_KEY, raw);
    expect(readTimingSidecar(store)).toBe(raw);
  });

  it("returns null — without throwing — when storage access throws", () => {
    // The project draft reads this once into state; a restricted browser
    // context must degrade to null timing, never crash the editor.
    expect(readTimingSidecar(throwing)).toBeNull();
  });

  it.each(["{not json", "", "42", '"str"', "[1,2]", "null"])("rejects %s", (raw) => {
    const store = memoryStore();
    store.setItem(WORDTIMES_KEY, raw);
    expect(readTimingSidecar(store)).toBeNull();
    expect(validTimingSidecar(raw)).toBe(false);
  });

  it("accepts any JSON object shape — deep validation stays in readWordTiming", () => {
    expect(validTimingSidecar(JSON.stringify({ unexpected: "shape" }))).toBe(true);
  });

  it("rejects non-string inputs", () => {
    expect(validTimingSidecar(null)).toBe(false);
    expect(validTimingSidecar(undefined)).toBe(false);
    expect(validTimingSidecar(42)).toBe(false);
    expect(validTimingSidecar({ already: "parsed" })).toBe(false);
  });
});
