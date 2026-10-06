import { describe, expect, it } from "vitest";
import { makeCaptionPlan, speechPhrases, suggestSceneLabel } from "../../shared/caption-plan";
import { buildScript } from "./script";
import type { NichePack } from "./packs";

describe("caption meaning and modes", () => {
  it("keeps negation attached and never brings in a future scene", () => {
    const words = ["This", "clip", "is", "clearly", "not", "a", "race.", "Garage", "footage."].map((word,index) => ({ word, start: index, end: index+1, cueIndex: index < 7 ? 0 : 1 }));
    const phrases = speechPhrases(words);
    expect(phrases.map(item => item.text)).toEqual(["This clip is clearly not a race.", "Garage footage."]);
    expect(phrases[0].end).toBe(7);
    expect(phrases[1].start).toBe(7);
  });
  it("keeps different beats separate even when both are called beat", () => {
    const phrases = speechPhrases([{ word: "Garage.", start: 0, end: 1, cueKind: "beat", cueIndex: 1 }, { word: "Road.", start: 1, end: 2, cueKind: "beat", cueIndex: 2 }]);
    expect(phrases.map(item => item.text)).toEqual(["Garage.", "Road."]);
  });
  it("uses scene labels for car footage, with independent label edits and an explicit off mode", () => {
    const scenes = [{ text: "Porsche GT3 RS", start: 0, end: 4 }];
    expect(makeCaptionPlan({ mode: "auto", voiceOn: true, scenes, labels: ["IN THE GARAGE"] })).toEqual([{ text: "IN THE GARAGE", start: 0, end: 4, kind: "scene" }]);
    expect(makeCaptionPlan({ mode: "off", voiceOn: false, scenes })).toEqual([]);
    expect(makeCaptionPlan({ mode: "scene", voiceOn: false, scenes, labels: [""] })).toEqual([]);
    expect(suggestSceneLabel("No racing here. It is a parked car.")).toBe("No racing here.");
  });
  it("does not generate unsupported locations or stock marketing claims for car edits", () => {
    const profile = { niche: "Cars", audience: "Car fans", offer: "Car edits", tone: "Cinematic", proof: "Footage" };
    const pack = { hooks: ["Most brands fail"], ctas: ["Buy now"], hashtags: [] } as unknown as NichePack;
    const script = buildScript("A Porsche GT3 RS car edit", profile, pack);
    expect(script.hook).toBe("PORSCHE GT3 RS");
    expect(script.cues.map(cue=>cue.text).join(" ")).not.toMatch(/garage|track|race|night|competitors|proof:/i);
  });
});
