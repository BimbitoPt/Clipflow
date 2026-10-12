import { describe, expect, it } from "vitest";
import { isTimedCueTiming, isTimedCueTimingArray } from "./word-timing-validation";

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
});
