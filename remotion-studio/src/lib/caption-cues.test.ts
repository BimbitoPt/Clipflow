import { describe, expect, it } from "vitest";
import { alignCaptionPhrases, autoCaptionCues } from "./caption-cues";

const script = "One idea. Five episodes start here.";
const timings = ["One", "idea", "Five", "episodes", "start", "here"].map((word, index) => ({ word, start: index * .4, end: index * .4 + .3 }));

describe("caption phrase alignment", () => {
  it("keeps editorial phrases on their spoken words", () => {
    const cues = alignCaptionPhrases(script, [
      { text: "One idea.", emphasis: ["idea"] },
      { text: "Five episodes start here.", emphasis: ["Five"] },
    ], timings);
    expect(cues).toHaveLength(2);
    expect(cues[1].start).toBeCloseTo(.74);
    expect(cues[1].emphasis).toEqual(["Five"]);
  });

  it("rejects missing or reordered narration", () => {
    expect(() => alignCaptionPhrases(script, [{ text: "Five episodes" }], timings)).toThrow("does not match");
    expect(() => alignCaptionPhrases(script, [{ text: "One idea." }], timings)).toThrow("full narration");
  });

  it("splits automatic cues at sentence boundaries", () => {
    expect(autoCaptionCues(script, timings).map((cue) => cue.text)).toEqual(["One idea.", "Five episodes start here."]);
  });
});
