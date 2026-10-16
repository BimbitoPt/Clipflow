import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./storage";
import type { Profile } from "./profile";
import {
  defaultApprovedShots,
  planInputsSig,
  readSession,
  readTimingSidecar,
  readWordTiming,
  validApprovedShots,
  validPlanSeeds,
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
    planSeeds: {},
    approvedShots: defaultApprovedShots(),
    planEdits: {},
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

  it("round-trips plan seeds and approvals", () => {
    const store = memoryStore();
    writeSession(store, {
      ...snapshot(),
      idea: "car detailing",
      planSeeds: { 0: 1 },
      approvedShots: [true, false, false, false, false],
      planEdits: { 0: { imagePrompt: "custom", durationSecs: 6.5 } },
    });
    const back = readSession(store);
    expect(back?.planSeeds).toEqual({ 0: 1 });
    expect(back?.approvedShots).toEqual([true, false, false, false, false]);
    expect(back?.planEdits).toEqual({ 0: { imagePrompt: "custom", durationSecs: 6.5 } });
  });

  it("reads pre-plan snapshots with plan defaults", () => {
    const store = memoryStore();
    const { planSeeds: _seeds, approvedShots: _shots, planEdits: _edits, ...legacy } = snapshot();
    store.setItem(SESSION_KEY, JSON.stringify({ version: 1, ...legacy }));
    const back = readSession(store)!;
    expect(back.planSeeds).toEqual({});
    expect(back.approvedShots).toEqual([false, false, false, false, false]);
    expect(back.planEdits).toEqual({});
  });

  it("falls back to plan defaults without nulling the session", () => {
    for (const extra of [
      { planSeeds: { 0: 1, 5: 2 } },
      { planSeeds: { 0: "take-2" } },
      { planSeeds: [1, 2] },
      { planSeeds: null },
      { approvedShots: [true, false] },
      { approvedShots: [true, false, false, false, "yes"] },
      { approvedShots: "all" },
      { planEdits: { 0: { imagePrompt: "" } } },
      { planEdits: { 5: { cameraDirection: "x" } } },
      { planEdits: [1, 2] },
      { planEdits: "none" },
    ]) {
      const store = memoryStore();
      store.setItem(SESSION_KEY, JSON.stringify({ version: 1, ...snapshot(), ...extra }));
      const back = readSession(store);
      expect(back, JSON.stringify(extra)).not.toBeNull();
      expect(back!.planSeeds).toEqual("planSeeds" in extra ? {} : snapshot().planSeeds);
      expect(back!.approvedShots).toEqual(
        "approvedShots" in extra ? [false, false, false, false, false] : snapshot().approvedShots,
      );
      expect(back!.planEdits).toEqual("planEdits" in extra ? {} : snapshot().planEdits);
    }
  });
});

describe("plan guards", () => {
  it("validPlanSeeds keeps sparse shot indexes, rejects the rest", () => {
    expect(validPlanSeeds({ 0: 1, 4: 3 })).toEqual({ 0: 1, 4: 3 });
    expect(validPlanSeeds({})).toEqual({});
    for (const bad of [{ 5: 1 }, { "-1": 1 }, { 0: NaN }, { 0: "1" }, [1], null, 42, "x"]) {
      expect(validPlanSeeds(bad)).toEqual({});
    }
  });

  it("validApprovedShots accepts only five booleans", () => {
    expect(validApprovedShots([true, false, false, false, true])).toEqual([true, false, false, false, true]);
    for (const bad of [[true], [false, false, false, false, false, false], [0, 0, 0, 0, 0], null, {}]) {
      expect(validApprovedShots(bad)).toEqual([false, false, false, false, false]);
    }
  });

  it("planInputsSig is stable for equal inputs, distinct otherwise", () => {
    const base = { idea: "car detailing", profile: PROFILE, scriptOverrides: {}, pack: "clipflow" };
    expect(planInputsSig(base)).toBe(planInputsSig({ ...base, profile: { ...PROFILE } }));
    expect(planInputsSig(base)).not.toBe(planInputsSig({ ...base, idea: "other" }));
    expect(planInputsSig(base)).not.toBe(planInputsSig({ ...base, pack: "mstudio" }));
    expect(planInputsSig(base)).not.toBe(planInputsSig({ ...base, scriptOverrides: { 0: "new hook" } }));
  });

  it("replays the reset-vs-restore timeline: restored approvals survive", () => {
    // Mirrors the reset effect in useClipflowProject (declared before the
    // restore effects; restores record their signature, the post-restore
    // refire skips while inputs still match, later edits reset).
    const initial = { idea: "fixed-price websites that ship in two weeks", profile: PROFILE, scriptOverrides: {}, pack: "mstudio" };
    const restored = { idea: "car detailing", profile: PROFILE, scriptOverrides: {}, pack: "clipflow" };
    let restoredSig: string | null = null;
    let plan: { seeds: Record<number, number>; approvals: boolean[]; edits: Record<number, unknown> } = { seeds: {}, approvals: defaultApprovedShots(), edits: {} };
    const resetEffect = (inputs: typeof initial) => {
      const sig = planInputsSig(inputs);
      if (restoredSig !== null) {
        if (restoredSig === sig) return "skipped";
        restoredSig = null;
      }
      plan = { seeds: {}, approvals: defaultApprovedShots(), edits: {} };
      return "reset";
    };

    expect(resetEffect(initial)).toBe("reset"); // mount: no-op over defaults
    // Restore lands: takes, approvals and hand-edits + signature recorded after the reset settled.
    plan = { seeds: { 0: 1 }, approvals: [true, false, false, false, false], edits: { 2: { imagePrompt: "custom" } } };
    restoredSig = planInputsSig(restored);
    expect(resetEffect(restored)).toBe("skipped"); // post-restore refire settles
    expect(plan).toEqual({ seeds: { 0: 1 }, approvals: [true, false, false, false, false], edits: { 2: { imagePrompt: "custom" } } });
    expect(resetEffect({ ...restored, idea: "new idea" })).toBe("reset"); // genuine edit invalidates
    expect(plan).toEqual({ seeds: {}, approvals: [false, false, false, false, false], edits: {} });
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

  it("rejects the whole sidecar when a windows array disagrees with the cues", () => {
    const store = memoryStore();
    store.setItem(
      WORDTIMES_KEY,
      JSON.stringify({ idea: "ship a site in two weeks", profile: PROFILE, cues: [cue], windows: [{ start: 0, end: 1 }, { start: 1, end: 2 }] }),
    );
    expect(readWordTiming(store, "ship a site in two weeks", PROFILE)).toBeNull();
  });

  it("rejects the whole sidecar on NaN, inverted, or negative windows", () => {
    // Note: JSON.stringify turns NaN into null, so the first case exercises
    // the null-start path through storage; true NaN is covered directly in
    // isTimingWindow tests above.
    for (const windows of [
      [{ start: Number.NaN, end: 1 }],
      [{ start: 2, end: 1 }],
      [{ start: -1, end: 1 }],
    ]) {
      const store = memoryStore();
      store.setItem(
        WORDTIMES_KEY,
        JSON.stringify({ idea: "ship a site in two weeks", profile: PROFILE, cues: [cue], windows }),
      );
      expect(readWordTiming(store, "ship a site in two weeks", PROFILE), JSON.stringify(windows)).toBeNull();
    }
  });

  it("rejects the whole sidecar when assets misalign with the cues", () => {
    const store = memoryStore();
    store.setItem(
      WORDTIMES_KEY,
      JSON.stringify({ idea: "ship a site in two weeks", profile: PROFILE, cues: [cue], assets: [null, null] }),
    );
    expect(readWordTiming(store, "ship a site in two weeks", PROFILE)).toBeNull();
  });

  it("rejects the whole sidecar on negative cue times", () => {
    const store = memoryStore();
    store.setItem(
      WORDTIMES_KEY,
      JSON.stringify({ idea: "ship a site in two weeks", profile: PROFILE, cues: [{ span: [-2, 0], words: null }] }),
    );
    expect(readWordTiming(store, "ship a site in two weeks", PROFILE)).toBeNull();
  });

  it("accepts a cues-only sidecar: absent or null windows/assets degrade to null", () => {
    for (const extra of [{}, { windows: null, assets: null }]) {
      const store = memoryStore();
      store.setItem(
        WORDTIMES_KEY,
        JSON.stringify({ idea: "ship a site in two weeks", profile: PROFILE, cues: [cue], ...extra }),
      );
      const result = readWordTiming(store, "ship a site in two weeks", PROFILE)!;
      expect(result.cues).toEqual([cue]);
      expect(result.windows).toBeNull();
      expect(result.assets).toBeNull();
    }
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
