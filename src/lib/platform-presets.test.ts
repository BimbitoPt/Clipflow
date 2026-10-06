import { describe, expect, it } from "vitest";
import { isPlatformId, platformPreset, PLATFORM_PRESETS } from "../../shared/platform-presets";

describe("platform-presets", () => {
  it("keeps every caption anchor inside the safe band", () => {
    expect(PLATFORM_PRESETS.length).toBe(3);
    for (const preset of PLATFORM_PRESETS) {
      expect(preset.captionAnchor).toBeGreaterThanOrEqual(0.6);
      expect(preset.captionAnchor).toBeLessThanOrEqual(0.7);
      expect(preset.spec.length).toBeGreaterThan(0);
      expect(preset.tip.length).toBeGreaterThan(0);
    }
  });

  it("resolves known platforms and falls back to TikTok", () => {
    expect(platformPreset("reels").label).toBe("Instagram Reels");
    expect(platformPreset("shorts").captionAnchor).toBe(0.66);
    expect(platformPreset("vine").id).toBe("tiktok");
    expect(platformPreset(null).id).toBe("tiktok");
    expect(platformPreset(undefined).id).toBe("tiktok");
  });

  it("validates platform ids", () => {
    expect(isPlatformId("tiktok")).toBe(true);
    expect(isPlatformId("reels")).toBe(true);
    expect(isPlatformId("nope")).toBe(false);
  });
});
