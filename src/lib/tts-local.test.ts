import { describe, expect, it } from "vitest";
import { createSpeechT5Loader } from "./tts-local";

describe("tts-local", () => {
  it("factory returns a loader function without touching network", async () => {
    const loader = createSpeechT5Loader();
    expect(typeof loader).toBe("function");
  });
});
