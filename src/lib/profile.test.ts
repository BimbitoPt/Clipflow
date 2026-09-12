import { describe, expect, it } from "vitest";
import { KEY, MSTUDIO_PROFILE, loadProfile, saveProfile, type StorageLike } from "./profile";

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
    expect(loadProfile(memStorage({ [KEY]: "{nope" }))).toBeNull();
  });

  it("rejects wrong shapes as null", () => {
    const cases: string[] = [
      "{}",
      "[]",
      "\"str\"",
      "123",
      "null",
      JSON.stringify({ niche: "web design studio" }),
      JSON.stringify({ ...MSTUDIO_PROFILE, offer: 123 }),
    ];
    for (const raw of cases) {
      expect(loadProfile(memStorage({ [KEY]: raw })), raw).toBeNull();
    }
  });

  it("returns null when storage throws", () => {
    const throwing: StorageLike = {
      getItem: (): string | null => {
        throw new Error("denied");
      },
      setItem: (): void => {},
    };
    expect(loadProfile(throwing)).toBeNull();
  });

  it("mstudio default names the studio offer", () => {
    expect(MSTUDIO_PROFILE.niche).toMatch(/web/i);
    expect(MSTUDIO_PROFILE.offer.length).toBeGreaterThan(10);
    for (const f of [MSTUDIO_PROFILE.niche, MSTUDIO_PROFILE.audience, MSTUDIO_PROFILE.offer, MSTUDIO_PROFILE.tone, MSTUDIO_PROFILE.proof]) {
      expect(f).toMatch(/\S/);
    }
  });
});
