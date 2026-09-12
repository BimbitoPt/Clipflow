import { describe, expect, it } from "vitest";
import { MSTUDIO_PROFILE, loadProfile, saveProfile, type StorageLike } from "./profile";

function memStorage(seed: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe("profile", () => {
  it("round-trips through storage", () => {
    const s = memStorage();
    expect(loadProfile(s)).toBeNull();
    saveProfile(s, MSTUDIO_PROFILE);
    expect(loadProfile(s)).toEqual(MSTUDIO_PROFILE);
  });

  it("rejects corrupt json as null", () => {
    expect(loadProfile(memStorage({ "clipflow.profile": "{nope" }))).toBeNull();
  });

  it("mstudio default names the studio offer", () => {
    expect(MSTUDIO_PROFILE.niche).toMatch(/web/i);
    expect(MSTUDIO_PROFILE.offer.length).toBeGreaterThan(10);
  });
});
