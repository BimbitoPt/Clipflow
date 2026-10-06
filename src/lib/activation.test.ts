import { describe, expect, it } from "vitest";
import {
  ACTIVATION_KEY,
  isActivated,
  loadActivation,
  markMilestone,
  recordExport,
  SAMPLE_IDEA,
  timeToActivationMs,
  timeToPreviewMs,
  type ActivationState,
} from "./activation";
import type { StorageLike } from "./profile";

function memStore(seed: Record<string, string> = {}): StorageLike & { backing: Map<string, string> } {
  const backing = new Map(Object.entries(seed));
  return {
    backing,
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, value),
  };
}

describe("activation", () => {
  it("starts empty and not activated", () => {
    const state = loadActivation(memStore());
    expect(state).toEqual({ firstVisit: null, firstPreview: null, firstExport: null, exportCount: 0 });
    expect(isActivated(state)).toBe(false);
    expect(timeToPreviewMs(state)).toBeNull();
    expect(timeToActivationMs(state)).toBeNull();
  });

  it("stamps first occurrence only", () => {
    const store = memStore();
    markMilestone(store, "firstVisit", 1000);
    markMilestone(store, "firstVisit", 2000);
    expect(loadActivation(store).firstVisit).toBe(1000);
  });

  it("measures TTV from visit to preview and activation", () => {
    const store = memStore();
    markMilestone(store, "firstVisit", 1000);
    markMilestone(store, "firstPreview", 45000);
    expect(timeToPreviewMs(loadActivation(store))).toBe(44000);
    expect(timeToActivationMs(loadActivation(store))).toBeNull();
    recordExport(store, 180000);
    const state = loadActivation(store);
    expect(isActivated(state)).toBe(true);
    expect(timeToActivationMs(state)).toBe(179000);
    expect(state.exportCount).toBe(1);
  });

  it("counts every export but stamps activation once", () => {
    const store = memStore();
    recordExport(store, 5000);
    recordExport(store, 6000);
    const state = loadActivation(store);
    expect(state.firstExport).toBe(5000);
    expect(state.exportCount).toBe(2);
  });

  it("recovers from corrupt data", () => {
    const state = loadActivation(memStore({ [ACTIVATION_KEY]: "not-json{{{", }));
    expect(state).toEqual({ firstVisit: null, firstPreview: null, firstExport: null, exportCount: 0 });
  });

  it("rejects invalid timestamps and counts", () => {
    const state = loadActivation(
      memStore({
        [ACTIVATION_KEY]: JSON.stringify({ firstVisit: -5, firstPreview: NaN, firstExport: "soon", exportCount: -2 } as unknown as ActivationState),
      }),
    );
    expect(state).toEqual({ firstVisit: null, firstPreview: null, firstExport: null, exportCount: 0 });
  });

  it("ships a non-empty sample idea", () => {
    expect(SAMPLE_IDEA.trim().length).toBeGreaterThan(10);
  });

  it("sample idea builds a five-cue script on the default profile", async () => {
    const { buildScript } = await import("./script");
    const { loadPack } = await import("./packs");
    const { MSTUDIO_PROFILE } = await import("./profile");
    const script = buildScript(SAMPLE_IDEA, MSTUDIO_PROFILE, loadPack("mstudio"));
    expect(script.cues.length).toBe(5);
    expect(script.cues.every((cue) => cue.text.trim().length > 0)).toBe(true);
  });
});
