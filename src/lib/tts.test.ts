import { describe, expect, it, vi } from "vitest";
import { previewSpeak, synthesizeLocal } from "./tts";

describe("tts", () => {
  it("preview speaks once and cancels first", () => {
    const synth = { speak: vi.fn(), cancel: vi.fn() };
    previewSpeak("hello niche", synth);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it("preview with no backend is a silent no-op", () => {
    expect(() => previewSpeak("x")).not.toThrow();
  });

  it("local synth without loader throws E_TTS_BACKEND", async () => {
    await expect(synthesizeLocal("x")).rejects.toThrow(/E_TTS_BACKEND/);
  });

  it("local synth uses injected loader", async () => {
    const out = await synthesizeLocal("x", async () => new Float32Array([0.1, 0.2]));
    expect(out.length).toBe(2);
  });
});
