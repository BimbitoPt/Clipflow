import { describe, expect, it } from "vitest";
import { MSTUDIO_PROFILE } from "./profile";
import { loadPack } from "./packs";
import { buildScript } from "./script";
import { planWords } from "./planner";

const script = buildScript("ships in two weeks", MSTUDIO_PROFILE, loadPack("mstudio"));

describe("planWords", () => {
  it("splits each cue evenly with no gaps", () => {
    const words = planWords(script);
    expect(words.length).toBeGreaterThan(10);
    for (let i = 1; i < words.length; i++) {
      expect(words[i]!.start).toBeGreaterThanOrEqual(words[i - 1]!.start);
    }
    const hookWords = words.filter((w) => w.cueKind === "hook");
    expect(hookWords[0]!.start).toBe(0);
    expect(hookWords[hookWords.length - 1]!.end).toBe(4);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(planWords(script))).toBe(JSON.stringify(planWords(script)));
  });
});
