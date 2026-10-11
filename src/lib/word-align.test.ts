import { describe, expect, it } from "vitest";
import { splitToken, wordSpansFromDurations, type PhonemeGroup, type WordSpan } from "../../shared/word-align";

// Frame math: 1 duration unit = 1/40 s. Helper builds uniform frames so the
// expected spans are hand-computable.
const w = (word: string, phonemes: string): PhonemeGroup => ({ word, phonemes });
// Float-exact equality is the wrong tool after rescaling — compare fields.
const expectSpan = (span: WordSpan | undefined, word: string, start: number, end: number) => {
  expect(span?.word).toBe(word);
  expect(span?.start).toBeCloseTo(start, 10);
  expect(span?.end).toBeCloseTo(end, 10);
};

describe("splitToken", () => {
  it("keeps internal apostrophes with the core and peels trailing punctuation", () => {
    expect(splitToken("follow.")).toEqual({ lead: "", core: "follow", trail: "." });
    expect(splitToken("don't")).toEqual({ lead: "", core: "don't", trail: "" });
    expect(splitToken("y'all,")).toEqual({ lead: "", core: "y'all", trail: "," });
    expect(splitToken("(Hey)")).toEqual({ lead: "(", core: "Hey", trail: ")" });
  });

  it("treats punctuation-only tokens as having no espeak core", () => {
    expect(splitToken("...")).toEqual({ lead: "...", core: "", trail: "" });
    expect(splitToken("'")).toEqual({ lead: "'", core: "", trail: "" });
  });
});

describe("wordSpansFromDurations", () => {
  // flat = "hˈaɪ ðˈɛɹ fɹˈɛnd" → 4 + 1 + 4 + 1 + 6 = 16 chars.
  const groups = [w("Hi", "hˈaɪ"), w("there", "ðˈɛɹ"), w("friend", "fɹˈɛnd")];
  const frames = [2, 2, 2, 2, 3, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2]; // 14 phonemes ×2 + 2 spaces ×3 = 34

  it("maps frames per phoneme char into contiguous word spans", () => {
    const spans = wordSpansFromDurations(groups, frames, 34 / 40);
    expectSpan(spans[0], "Hi", 0, 11 / 40); // 4 chars ×2 + trailing space ×3
    expectSpan(spans[1], "there", 11 / 40, 22 / 40);
    expectSpan(spans[2], "friend", 22 / 40, 34 / 40);
    // Contiguity contract — caption alignment relies on it.
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.start).toBeCloseTo(spans[i - 1]!.end, 10);
  });

  it("folds the trailing space into the left word and BOS/EOS silence into the edges", () => {
    const padded = [4, ...frames, 6]; // BOS = 4 frames lead-in, EOS = 6 frames tail
    const spans = wordSpansFromDurations(groups, padded, 44 / 40);
    expectSpan(spans[0], "Hi", 4 / 40, 15 / 40);
    expectSpan(spans[2], "friend", 26 / 40, 44 / 40); // last word absorbs EOS silence → ends at audio end
  });

  it("rescales the timeline so the last word ends exactly at the audio end", () => {
    const padded = [4, ...frames, 6]; // predicts 44 frames = 1.1s
    const spans = wordSpansFromDurations(groups, padded, 1); // audio is really 1.0s
    expectSpan(spans[0], "Hi", 4 / 44, 15 / 44);
    expectSpan(spans[2], "friend", 26 / 44, 1);
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.start).toBeCloseTo(spans[i - 1]!.end, 10);
  });

  it("gives punctuation-only tokens a span at their position without losing the count", () => {
    const punct: PhonemeGroup[] = [w("Wait.", "wˈɛɪt."), w("...", ""), w("Now", "nˈaʊ")];
    const punctFrames = [2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2]; // 10 phonemes ×2 + 1 space ×3 = 23
    const spans = wordSpansFromDurations(punct, punctFrames, 23 / 40);
    expect(spans.map((span) => span.word)).toEqual(["Wait.", "...", "Now"]);
    expectSpan(spans[0], "Wait.", 0, 12 / 40);
    expectSpan(spans[1], "...", 12 / 40, 15 / 40); // captures the inter-word pause
    expectSpan(spans[2], "Now", 15 / 40, 23 / 40);
  });

  it("keeps monotonic spans when a leading token has no phonemes", () => {
    const leading: PhonemeGroup[] = [w("“", ""), w("Go", "ɡˈoʊ")];
    const spans = wordSpansFromDurations(leading, [4, 2, 2, 2, 2, 2], 14 / 40);
    expectSpan(spans[0], "“", 0.1, 0.1);
    expectSpan(spans[1], "Go", 0.1, 14 / 40);
  });

  it("handles an all-punctuation script without throwing", () => {
    const spans = wordSpansFromDurations([w("...", "")], [2, 2], 4 / 40);
    expectSpan(spans[0], "...", 0.05, 0.05);
  });

  it("clamps negative predicted frames instead of walking time backwards", () => {
    const negative = [2, -5, 2, 2, 2, 3, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2];
    const spans = wordSpansFromDurations(groups, negative, 32 / 40);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end - 1e-9);
    }
  });

  it("fails loudly when the duration array does not match the phoneme string", () => {
    expect(() => wordSpansFromDurations(groups, frames.slice(0, 15), 1)).toThrow(/E_DURATION_SHAPE/);
  });

  it("fails loudly when durations disagree with the audio length", () => {
    expect(() => wordSpansFromDurations(groups, frames.map(() => 40), 2)).toThrow(/E_DURATION_MISMATCH/);
  });

  it("rejects a non-positive audio duration", () => {
    expect(() => wordSpansFromDurations(groups, frames, 0)).toThrow(/E_AUDIO_DURATION/);
    expect(() => wordSpansFromDurations(groups, frames, Number.NaN)).toThrow(/E_AUDIO_DURATION/);
  });

  it("returns nothing for an empty word list", () => {
    expect(wordSpansFromDurations([], [], 1)).toEqual([]);
  });
});
