import { describe, expect, it } from "vitest";
import { drawFrame, type DrawCtx } from "./render";
import type { Theme } from "./packs";

function stubCtx(): DrawCtx & { calls: string[]; texts: string[] } {
  return {
    calls: [],
    texts: [],
    fillStyle: "",
    font: "",
    fillRect(_x, _y, _w, _h) { this.calls.push("rect"); },
    fillText(t) { this.calls.push("text"); this.texts.push(String(t)); },
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
});
