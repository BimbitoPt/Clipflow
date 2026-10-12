import { describe, expect, it, vi } from "vitest";
import { MSTUDIO_PROFILE } from "./profile";
import { buildKeyframePrompt, createKeyframeGenerator, hashSeed, isSecretKey, KEYFRAME_MODEL, keyframeId, keyframeSeedOf, keyframeUrl, loadPollinationsKey, sanitizePollinationsKey, savePollinationsKey, KEYFRAME_MIN_INTERVAL_MS } from "./keyframes";

describe("keyframe prompts", () => {
  it("is deterministic and includes the beat text and niche", () => {
    const cue = "Hook: fixed-price websites that ship in two weeks";
    const a = buildKeyframePrompt(cue, MSTUDIO_PROFILE);
    const b = buildKeyframePrompt(cue, MSTUDIO_PROFILE);
    expect(a).toBe(b);
    expect(a).toContain("fixed-price websites that ship in two weeks");
    expect(a.toLowerCase()).toContain(MSTUDIO_PROFILE.niche.toLowerCase().slice(0, 20));
    expect(a).toContain("9:16");
    expect(a).toContain("no text");
  });

  it("normalizes whitespace and caps length", () => {
    const long = `line\nbreak ${"word ".repeat(80)}`;
    const prompt = buildKeyframePrompt(long, MSTUDIO_PROFILE);
    expect(prompt).not.toContain("\n");
    expect(prompt.length).toBeLessThan(900);
  });

  it("carries quality and composition directives", () => {
    const prompt = buildKeyframePrompt("Hook: fixed-price websites", MSTUDIO_PROFILE);
    expect(prompt).toContain("cinematic");
    expect(prompt).toContain("negative space");
    expect(prompt).toContain("no watermark");
  });
});

describe("keyframe seeds and ids", () => {
  it("hashes deterministically and stays in the positive 31-bit range", () => {
    expect(hashSeed("clipflow")).toBe(hashSeed("clipflow"));
    expect(hashSeed("clipflow")).not.toBe(hashSeed("clipflow2"));
    expect(hashSeed("anything at all")).toBeGreaterThanOrEqual(0);
  });

  it("round-trips seed through the storage id", () => {
    const seed = hashSeed("script-abc");
    const id = keyframeId(seed);
    expect(id).toMatch(/^gen-[a-z0-9]+$/); // passes upload-store's id pattern
    expect(keyframeSeedOf(id)).toBe(seed);
    expect(keyframeSeedOf("upload-123")).toBeNull();
    expect(keyframeSeedOf("gen-")).toBeNull();
  });
});

describe("keyframe urls", () => {
  it("encodes the prompt and pins size and seed", () => {
    const prompt = buildKeyframePrompt("Proof: ships in 1-2 weeks", MSTUDIO_PROFILE);
    const url = keyframeUrl(prompt, 12345);
    expect(url).toContain("https://gen.pollinations.ai/image/");
    expect(url).toContain("width=720");
    expect(url).toContain("height=1280");
    expect(url).toContain("seed=12345");
    expect(url).toContain(encodeURIComponent(KEYFRAME_MODEL));
    expect(url).not.toContain(" ");
    expect(url).not.toContain("nologo");
  });

  it("adds nologo+private+key when a free key is present", () => {
    const url = keyframeUrl("a hook scene", 99, { key: "pk_test12345678" });
    expect(url).toContain("nologo=true");
    expect(url).toContain("private=true");
    expect(url).toContain("key=pk_test12345678");
  });

  it("always sends the negative prompt by default", () => {
    const url = keyframeUrl("a hook scene", 99);
    expect(url).toContain("negative_prompt=");
    expect(url).toContain("watermark");
    const custom = keyframeUrl("a hook scene", 99, { negativePrompt: "blurry" });
    expect(custom).toContain("negative_prompt=blurry");
  });

  it("ignores invalid keys and never leaks them into anonymous urls", () => {
    expect(keyframeUrl("a hook scene", 99, { key: "not-a-key" })).not.toContain("key=");
    expect(keyframeUrl("a hook scene", 99, { key: "not-a-key" })).not.toContain("nologo");
  });

  it("accepts scoped secret (sk_...) keys as a deliberate local override", () => {
    expect(isSecretKey("sk_local-test12345678")).toBe(true);
    expect(isSecretKey("pk_abc12345")).toBe(false);
    expect(sanitizePollinationsKey("sk_local-test12345678")).toBe("sk_local-test12345678");
    const url = keyframeUrl("a hook scene", 99, { key: "sk_local-test12345678" });
    expect(url).toContain("key=sk_local-test12345678");
    expect(url).toContain("nologo=true");
  });
});

describe("pollinations key storage", () => {
  it("sanitizes, loads and saves only well-formed keys", () => {
    expect(sanitizePollinationsKey("pk_abc12345")).toBe("pk_abc12345");
    expect(sanitizePollinationsKey("  pk_live-xyz_987654321 ")).toBe("pk_live-xyz_987654321");
    expect(sanitizePollinationsKey("hello")).toBe("");
    expect(sanitizePollinationsKey("pk_short")).toBe("");
    expect(sanitizePollinationsKey("sk_short")).toBe("");
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
    savePollinationsKey(storage, "pk_test12345678");
    expect(loadPollinationsKey(storage)).toBe("pk_test12345678");
    savePollinationsKey(storage, "junk");
    expect(loadPollinationsKey(storage)).toBe("");
    savePollinationsKey(storage, "sk_local-test12345678");
    expect(loadPollinationsKey(storage)).toBe("sk_local-test12345678");
  });
});

function fakeResponse(status: number, blob = new Blob([new Uint8Array([1, 2, 3])])): { ok: boolean; status: number; blob(): Promise<Blob> } {
  return { ok: status >= 200 && status < 300, status, blob: async () => blob };
}

describe("keyframe generator", () => {
  it("returns the blob on first success without sleeping", async () => {
    const sleep = vi.fn(async () => {});
    const generate = createKeyframeGenerator({ fetchImpl: async () => fakeResponse(200), sleep, now: () => 0 });
    const blob = await generate("https://example.test/1");
    expect(blob.size).toBe(3);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("spaces consecutive requests by the anonymous interval", async () => {
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => { clock += ms; });
    const generate = createKeyframeGenerator({ fetchImpl: async () => fakeResponse(200), sleep, now: () => clock });
    await generate("https://example.test/1");
    await generate("https://example.test/2"); // clock unchanged → must wait
    expect(sleep).toHaveBeenCalledWith(KEYFRAME_MIN_INTERVAL_MS);
  });

  it("retries 402 rate-limit responses and eventually succeeds", async () => {
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => { clock += ms; });
    const responses = [fakeResponse(402), fakeResponse(402), fakeResponse(200)];
    const generate = createKeyframeGenerator({ fetchImpl: async () => responses.shift()!, sleep, now: () => clock, rateWaitMs: 16000, minIntervalMs: 0 });
    const blob = await generate("https://example.test/1");
    expect(blob.size).toBe(3);
    expect(responses).toHaveLength(0);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx with backoff, then gives up with a typed error", async () => {
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => { clock += ms; });
    const generate = createKeyframeGenerator({ fetchImpl: async () => fakeResponse(503), sleep, now: () => clock, minIntervalMs: 0, maxAttempts: 3, errorBackoffMs: 1000 });
    await expect(generate("https://example.test/1")).rejects.toThrow("keyframe_unavailable");
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("survives network failures within the attempt budget", async () => {
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => { clock += ms; });
    let calls = 0;
    const generate = createKeyframeGenerator({
      fetchImpl: async () => { calls++; if (calls < 3) throw new TypeError("network down"); return fakeResponse(200); },
      sleep, now: () => clock, minIntervalMs: 0, errorBackoffMs: 100,
    });
    const blob = await generate("https://example.test/1");
    expect(blob.size).toBe(3);
    expect(calls).toBe(3);
  });

  it("does not retry permanent 4xx errors", async () => {
    const sleep = vi.fn(async () => {});
    const generate = createKeyframeGenerator({ fetchImpl: async () => fakeResponse(403), sleep, now: () => 0 });
    await expect(generate("https://example.test/1")).rejects.toThrow("keyframe_failed_403");
    expect(sleep).not.toHaveBeenCalled();
  });
});
