import { describe, expect, it } from "vitest";
import {
  DURATIONS,
  SPRINGS,
  STAGGER,
  TRANSITIONS,
  clamp01,
  fadeKeys,
  framesToMs,
  msToFrames,
  staggerStart,
} from "../../shared/motion-tokens";

describe("motion-tokens", () => {
  it("keeps springs in the shipped range", () => {
    for (const s of Object.values(SPRINGS)) {
      expect(s.damping).toBeGreaterThanOrEqual(14);
      expect(s.damping).toBeLessThanOrEqual(22);
      expect(s.stiffness).toBeGreaterThanOrEqual(70);
      expect(s.stiffness).toBeLessThanOrEqual(125);
    }
    expect(SPRINGS.lively.stiffness).toBeGreaterThan(SPRINGS.soft.stiffness);
  });

  it("orders durations sanely", () => {
    expect(DURATIONS.beat).toBeLessThan(DURATIONS.enter);
    expect(DURATIONS.enter).toBeLessThan(DURATIONS.transition * 2);
    expect(DURATIONS.holdMin).toBeGreaterThan(DURATIONS.transition);
  });

  it("converts frames/ms consistently", () => {
    expect(framesToMs(30)).toBe(1000);
    expect(msToFrames(1000)).toBe(30);
    expect(msToFrames(0)).toBe(1);
  });

  it("staggers from index zero", () => {
    expect(staggerStart(0)).toBe(0);
    expect(staggerStart(3)).toBe(3 * STAGGER.tight);
    expect(staggerStart(2, STAGGER.loose)).toBe(28);
  });

  it("builds valid fade keyframes", () => {
    const [a, b, c, d] = fadeKeys(90);
    expect([a, b, c, d]).toEqual([0, 10, 87, 90]);
    const short = fadeKeys(9);
    expect(short[0]).toBe(0);
    expect(short[3]).toBe(9);
    expect(short[1]).toBeLessThanOrEqual(short[2]);
  });

  it("clamps", () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });

  it("lists known transitions", () => {
    expect(TRANSITIONS).toContain("fade");
  });
});
