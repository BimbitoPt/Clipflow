import { describe, expect, it } from "vitest";
import { isTimedCueTiming, isTimedCueTimingArray, isTimingWindow } from "./word-timing-validation";

describe("isTimedCueTiming", () => {
  it("accepts a valid cue with measured words", () => {
    expect(isTimedCueTiming({
      span: [0, 2],
      words: [
        { word: "Hello", start: 0, end: 0.5 },
        { word: "world", start: 0.5, end: 1 },
      ],
    })).toBe(true);
  });

  it("accepts a valid cue when word timings are unavailable", () => {
    expect(isTimedCueTiming({ span: [1, 3], words: null })).toBe(true);
  });

  it.each([
    null,
    {},
    { span: [0], words: null },
    { span: [2, 1], words: null },
    { span: [0, Number.POSITIVE_INFINITY], words: null },
    { span: [0, 1], words: {} },
    { span: [0, 1], words: [{ word: "hello", start: 0, end: Number.NaN }] },
    { span: [0, 1], words: [{ word: 123, start: 0, end: 1 }] },
    { span: [0, 1], words: [{ word: "hello", start: 2, end: 1 }] },
    // Bounds producers never emit: negative starts, empty tokens, words
    // outside their cue span, overlapping words.
    { span: [-1, 1], words: null },
    { span: [0, 1], words: [{ word: "", start: 0, end: 0.5 }] },
    { span: [0, 1], words: [{ word: "late", start: 0.9, end: 1.5 }] },
    { span: [0, 2], words: [{ word: "a", start: 0, end: 1 }, { word: "b", start: 0.5, end: 2 }] },
    { span: [0, 1], words: [{ word: "neg", start: -0.5, end: 0.5 }] },
  ])("rejects malformed timing data: %j", (value) => {
    expect(isTimedCueTiming(value)).toBe(false);
  });
});

describe("isTimedCueTimingArray", () => {
  it("accepts an array of valid cue timings", () => {
    expect(isTimedCueTimingArray([{ span: [0, 1], words: null }])).toBe(true);
  });

  it("rejects a sidecar containing any malformed cue", () => {
    expect(isTimedCueTimingArray([
      { span: [0, 1], words: null },
      { span: [1, 1], words: null },
    ])).toBe(false);
  });

  it("rejects non-arrays", () => {
    expect(isTimedCueTimingArray({ span: [0, 1], words: null })).toBe(false);
  });

  it("rejects cue spans that run backwards in time", () => {
    expect(
      isTimedCueTimingArray([
        { span: [2, 4], words: null },
        { span: [0, 2], words: null },
      ]),
    ).toBe(false);
  });

  it("accepts abutting cues and epsilon overlap like voiceGridFromCues", () => {
    expect(
      isTimedCueTimingArray([
        { span: [0, 2], words: null },
        { span: [2, 4], words: null },
      ]),
    ).toBe(true);
    expect(
      isTimedCueTimingArray([
        { span: [0, 2], words: null },
        { span: [2 - 0.5e-6, 4], words: null },
      ]),
    ).toBe(true);
  });
});

describe("isTimingWindow", () => {
  it("accepts finite, non-negative, non-inverted windows", () => {
    expect(isTimingWindow({ start: 0, end: 2 })).toBe(true);
  });

  it.each([
    null,
    {},
    { start: 0 },
    { start: Number.NaN, end: 1 },
    { start: 0, end: Number.POSITIVE_INFINITY },
    { start: -1, end: 1 },
    { start: 2, end: 1 },
    // Zero-width: planFrames requires strictly positive spans, so a
    // zero-width window carries no usable timing.
    { start: 1, end: 1 },
  ])("rejects %j", (value) => {
    expect(isTimingWindow(value)).toBe(false);
  });
});
