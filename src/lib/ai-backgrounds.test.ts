import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AI_BACKGROUNDS, assignAiBackgrounds } from "./ai-backgrounds";
import { MSTUDIO_PROFILE } from "./profile";

describe("local AI background library", () => {
  it("ships seventeen image files with stable IDs", () => {
    expect(AI_BACKGROUNDS).toHaveLength(17);
    expect(new Set(AI_BACKGROUNDS.map((item) => item.id)).size).toBe(17);
    for (const item of AI_BACKGROUNDS) {
      expect(item.src).toMatch(/^\/ai-backgrounds\/[a-z0-9-]+\.png$/);
      expect(existsSync(join(process.cwd(), "public", item.src.slice(1)))).toBe(true);
    }
  });

  it("matches five distinct scenes deterministically", () => {
    const cues = ["Start with an idea", "Build a script", "Show the proof", "Connect the workflow", "Open the next chapter"];
    const first = assignAiBackgrounds("a website becomes a video", MSTUDIO_PROFILE, cues);
    const second = assignAiBackgrounds("a website becomes a video", MSTUDIO_PROFILE, cues);
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(first).toHaveLength(5);
    expect(new Set(first.map((item) => item.id)).size).toBe(5);
    expect(first.every((item) => item.id.startsWith("blue-"))).toBe(true);
  });
});
