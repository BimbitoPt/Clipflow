import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { checkVoiceAssets, createKokoroLoader, DEFAULT_VOICE, KOKORO_SAMPLE_RATE, MODEL_REVISION, resampleLinear } from "./tts-local";
import { TIMESTAMPED_MODEL_REVISION } from "./tts-timed";

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

describe("voice asset readiness", () => {
  afterEach(() => vi.unstubAllGlobals());

  const ok = (body: unknown = new ArrayBuffer(8)) =>
    ({ ok: true, arrayBuffer: async () => body }) as Response;

  it("reports ready when model config and voice bin are staged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    await expect(checkVoiceAssets()).resolves.toEqual({ ready: true, missing: [] });
  });

  it("names the missing voice bin instead of failing late in init", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("/voices/") ? ({ ok: false }) as Response : ok())),
    );
    await expect(checkVoiceAssets()).resolves.toEqual({ ready: false, missing: ["voice"] });
  });

  it("treats an offline first run (fetch rejects) as fully missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(checkVoiceAssets()).resolves.toEqual({ ready: false, missing: ["model", "voice"] });
  });
});

describe("voice asset pinning", () => {
  it("runtime revisions match the install manifest (never track main)", () => {
    const manifest = readFileSync("scripts/install-kokoro-model.mjs", "utf8");
    const revision = (name: string): string => {
      const match = manifest.match(new RegExp(`const ${name} = "([0-9a-f]{40})"`));
      if (!match) throw new Error(`install manifest no longer pins ${name}`);
      return match[1]!;
    };
    expect(MODEL_REVISION).toBe(revision("REVISION"));
    expect(TIMESTAMPED_MODEL_REVISION).toBe(revision("TS_REVISION"));
    expect(manifest).toContain(`"${DEFAULT_VOICE}"`);
  });
});
