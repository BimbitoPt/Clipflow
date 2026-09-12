import { describe, expect, it } from "vitest";
import { drawFrame, type DrawCtx } from "./render";
import type { Theme } from "./packs";

type Rect = [number, number, number, number];
type TextArgs = [string, number, number, number | undefined];

function stubCtx(): DrawCtx & { calls: string[]; texts: string[]; rects: Rect[]; textArgs: TextArgs[] } {
  return {
    calls: [],
    texts: [],
    rects: [],
    textArgs: [],
    fillStyle: "",
    font: "",
    fillRect(this: any, x: number, y: number, w: number, h: number) {
      this.calls.push("rect");
      this.rects.push([x, y, w, h]);
    },
    fillText(this: any, t: string, x: number, y: number, maxWidth?: number) {
      this.calls.push("text");
      this.texts.push(String(t));
      this.textArgs.push([String(t), x, y, maxWidth]);
    },
    measureText(this: any, t: string) {
      const f: string = this.font ?? "";
      const m = /(\d+)px/.exec(f);
      const size = m ? Number(m[1]) : 16;
      return { width: String(t).length * size * 0.55 };
    },
  };
}

const theme: Theme = { bg: ["#080A0D", "#12306e"], accent: "#246BFD", font: "700 96px system-ui" };

describe("render", () => {
  it("paints bg, accent bar and cue text", () => {
    const ctx = stubCtx();
    drawFrame(ctx, { t: 1, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } }, theme);
    expect(ctx.calls).toContain("rect");
    expect(ctx.calls).toContain("text");
    expect(ctx.texts.join(" ")).toMatch(/Hello niche/);
  });

  it("uses gradient path with two stops", () => {
    const stops: Array<[number, string]> = [];
    const gradient = {
      addColorStop(o: number, c: string) { stops.push([o, c]); },
    };
    const assigned: unknown[] = [];
    let current: unknown = "";
    const ctx = {
      ...stubCtx(),
      createLinearGradient(_x0: number, _y0: number, _x1: number, _y1: number) {
        return gradient as unknown as CanvasGradient;
      },
    };
    Object.defineProperty(ctx, "fillStyle", {
      get() { return current; },
      set(v: unknown) { current = v; assigned.push(v); },
      configurable: true,
    });
    drawFrame(ctx, { t: 1, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } }, theme);
    expect(stops.length).toBe(2);
    expect(stops[0]).toEqual([0, theme.bg[0]]);
    expect(stops[1]).toEqual([1, theme.bg[1]]);
    expect(assigned).toContain(gradient);
  });

  it("fits long lines without maxWidth squash", () => {
    const ctx = stubCtx();
    const long = "word ".repeat(40).trim(); // 200-char cue
    expect(long.length).toBeGreaterThanOrEqual(199);
    drawFrame(ctx, { t: 1, cue: { start: 0, end: 4, kind: "hook", text: long } }, theme);
    const m = /(\d+)px/.exec(ctx.font);
    const finalSize = m ? Number(m[1]) : 96;
    expect(finalSize).toBeLessThan(96);
    expect(ctx.textArgs.length).toBeGreaterThan(0);
    for (const a of ctx.textArgs) expect(a[3]).toBeUndefined();
  });

  it("draws progress bar at half width for t=22.5", () => {
    const ctx = stubCtx();
    drawFrame(ctx, { t: 22.5, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } }, theme);
    const near = ctx.rects.filter(([, , w]) => Math.abs(w - 360) <= 2);
    expect(near.length).toBeGreaterThan(0);
  });
});
