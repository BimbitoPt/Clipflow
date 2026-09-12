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

  it("is contiguous within a cue", () => {
    const words = planWords(script);
    const hookWords = words.filter((w) => w.cueKind === "hook");
    expect(hookWords.length).toBeGreaterThan(1);
    for (let i = 1; i < hookWords.length; i++) {
      expect(hookWords[i]!.start).toBe(hookWords[i - 1]!.end);
    }
  });

  it("uses equal widths within a cue", () => {
    const words = planWords(script);
    const hookWords = words.filter((w) => w.cueKind === "hook");
    const durations = hookWords.map((w) => w.end - w.start);
    for (const d of durations) {
      expect(Math.abs(d - durations[0]!)).toBeLessThan(1e-9);
    }
  });

  it("covers the full span for a single-word cue", () => {
    const single = planWords({
      ...script,
      cues: [{ start: 0, end: 4, kind: "hook", text: "Hi" }],
    });
    expect(single.length).toBe(1);
    expect(single[0]!.start).toBe(0);
    expect(single[0]!.end).toBe(4);
  });
});
