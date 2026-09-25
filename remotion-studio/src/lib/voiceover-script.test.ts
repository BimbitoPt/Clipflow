import { describe, expect, it } from "vitest";
import { defaultVoiceoverScript } from "./voiceover-script";

describe("default narration script", () => {
  it("combines unique clip points in story order", () => {
    expect(defaultVoiceoverScript({ hook: "A hook.", keyMessage: "The point.", supportingPoint: "the point.", proof: null, cta: "Try it." })).toBe("A hook. The point. Try it.");
  });

  it("stays within SpeechT5 script limits at a word boundary", () => {
    const script = defaultVoiceoverScript({ hook: "Hook", keyMessage: "long message ".repeat(80), supportingPoint: "more words", proof: null, cta: "Start" });
    expect(script.length).toBeLessThanOrEqual(900);
    expect(script.endsWith(".")).toBe(true);
  });
});
