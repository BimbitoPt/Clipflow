import { describe, expect, it } from "vitest";
import { createSpeechT5Loader } from "./tts-local";

describe("tts-local", () => {
  it("factory returns a loader function without touching network", async () => {
    const loader = createSpeechT5Loader();
    expect(typeof loader).toBe("function");
  });

  it("two factory calls return distinct loader functions without network", async () => {
    const a = createSpeechT5Loader();
    const b = createSpeechT5Loader();
    expect(typeof a).toBe("function");
    expect(typeof b).toBe("function");
    expect(a).not.toBe(b);
  });
});
