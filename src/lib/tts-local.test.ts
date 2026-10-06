import { describe, expect, it } from "vitest";
import { createKokoroLoader, DEFAULT_VOICE, KOKORO_SAMPLE_RATE, resampleLinear } from "./tts-local";

describe("tts-local", () => {
  it("factory returns a loader function without touching network", async () => {
    const loader = createKokoroLoader();
    expect(typeof loader).toBe("function");
  });

  it("two factory calls return distinct loader functions without network", async () => {
    const a = createKokoroLoader();
    const b = createKokoroLoader();
    expect(typeof a).toBe("function");
    expect(typeof b).toBe("function");
    expect(a).not.toBe(b);
  });

  it("pins the Kokoro shipping contract", () => {
    // 24 kHz native output: both export paths resample from here (browser
    // 44.1 kHz upsample, desktop 16 kHz downsample). Changing this means
    // touching every consumer in App.tsx.
    expect(KOKORO_SAMPLE_RATE).toBe(24000);
    expect(DEFAULT_VOICE).toBe("af_heart");
  });

  it("resamples 24 kHz voice to the desktop 16 kHz sink", () => {
    const pcm = new Float32Array(24000);
    const out = resampleLinear(pcm, KOKORO_SAMPLE_RATE, 16000);
    expect(out).toHaveLength(16000);
  });

  it("resamples 24 kHz voice to the browser 44.1 kHz AAC rate", () => {
    const pcm = new Float32Array(24000);
    const out = resampleLinear(pcm, KOKORO_SAMPLE_RATE, 44100);
    expect(out).toHaveLength(44100);
  });
});
