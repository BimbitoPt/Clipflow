import { describe, expect, it } from "vitest";
import { drawFrame, type DrawCtx } from "./render";
import type { Theme } from "./packs";

type Rect = [number, number, number, number];
type TextArgs = [string, number, number, number | undefined];

function stubCtx(): DrawCtx & {
  calls: string[];
  texts: string[];
  rects: Rect[];
  textArgs: TextArgs[];
  fonts: string[];
  accents: unknown[];
  assigned: unknown[];
  scales: Array<[number, number]>;
  drawImageCalls: Array<{ img: unknown; dx: number; dy: number; dw: number; dh: number }>;
  globalAlphaValues: number[];
} {
  const stub = {
    calls: [] as string[],
    texts: [] as string[],
    rects: [] as Rect[],
    textArgs: [] as TextArgs[],
    fonts: [] as string[],
    accents: [] as unknown[],
    assigned: [] as unknown[],
    scales: [] as Array<[number, number]>,
    drawImageCalls: [] as Array<{ img: unknown; dx: number; dy: number; dw: number; dh: number }>,
    globalAlphaValues: [] as number[],
    _fillStyle: "" as unknown,
    _alpha: 1,
    font: "",
    fillRect(this: any, x: number, y: number, w: number, h: number) {
      this.calls.push("rect");
      this.rects.push([x, y, w, h]);
    },
    fillText(this: any, t: string, x: number, y: number, maxWidth?: number) {
      this.calls.push("text");
      this.texts.push(String(t));
      this.textArgs.push([String(t), x, y, maxWidth]);
      this.fonts.push(String(this.font ?? ""));
      this.accents.push(this._fillStyle);
    },
    measureText(this: any, t: string) {
      const f: string = this.font ?? "";
      const m = /(\d+)px/.exec(f);
      const size = m ? Number(m[1]) : 16;
      return { width: String(t).length * size * 0.55 };
    },
    save(this: any) {
      this.calls.push("save");
    },
    restore(this: any) {
      this.calls.push("restore");
    },
    translate(this: any, _x: number, _y: number) {
      this.calls.push("translate");
    },
    scale(this: any, x: number, y: number) {
      this.calls.push("scale");
      this.scales.push([x, y]);
    },
    drawImage(this: any, img: unknown, dx: number, dy: number, dw: number, dh: number) {
      this.calls.push("drawImage");
      this.drawImageCalls.push({ img, dx, dy, dw, dh });
    },
    beginPath(this: any) {
      this.calls.push("beginPath");
    },
    arc(this: any) {
      this.calls.push("arc");
    },
    fill(this: any) {
      this.calls.push("fill");
    },
  };
  Object.defineProperty(stub, "fillStyle", {
    get(this: any) {
      return this._fillStyle;
    },
    set(this: any, v: unknown) {
      this._fillStyle = v;
      this.assigned.push(v);
    },
    configurable: true,
    enumerable: true,
  });
  Object.defineProperty(stub, "globalAlpha", {
    get(this: any) {
      return this._alpha;
    },
    set(this: any, v: number) {
      this._alpha = v;
      this.globalAlphaValues.push(v);
    },
    configurable: true,
    enumerable: true,
  });
  return stub as unknown as DrawCtx & {
    calls: string[];
    texts: string[];
    rects: Rect[];
    textArgs: TextArgs[];
    fonts: string[];
    accents: unknown[];
    assigned: unknown[];
    scales: Array<[number, number]>;
    drawImageCalls: Array<{ img: unknown; dx: number; dy: number; dw: number; dh: number }>;
    globalAlphaValues: number[];
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

  it("pops current word in accent", () => {
    const ctx = stubCtx();
    const words = [
      { word: "Hello", start: 0, end: 2, cueKind: "hook" as const },
      { word: "niche", start: 2, end: 4, cueKind: "hook" as const },
    ];
    drawFrame(
      ctx,
      { t: 3, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } },
      theme,
      720,
      1280,
      { words },
    );
    expect(ctx.texts.join(" ")).toMatch(/niche/);
    const nicheIdx = ctx.texts.findIndex((t) => t === "niche");
    expect(nicheIdx).toBeGreaterThanOrEqual(0);
    expect(ctx.accents[nicheIdx]).toBe(theme.accent);
  });

  it("applies ken burns zoom at t=45", () => {
    const ctx = stubCtx();
    drawFrame(ctx, { t: 45, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } }, theme);
    const max = Math.max(...ctx.scales.map(([x, y]) => Math.max(x, y)), 0);
    expect(max).toBeGreaterThan(1);
  });

  it("draws b-roll cover-fit with dim overlay", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 1, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } },
      theme,
      720,
      1280,
      { image: { width: 100, height: 100 } },
    );
    expect(ctx.drawImageCalls.length).toBeGreaterThan(0);
    expect(ctx.globalAlphaValues).toContain(0.55);
  });

  it("balances save/restore with b-roll inside zoom", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 10, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } },
      theme,
      720,
      1280,
      { image: { width: 100, height: 100 } },
    );
    const saves = ctx.calls.filter((c) => c === "save").length;
    const restores = ctx.calls.filter((c) => c === "restore").length;
    expect(saves).toBeGreaterThan(0);
    expect(saves).toBe(restores);
    const saveIdx = ctx.calls.indexOf("save");
    const restoreIdx = ctx.calls.indexOf("restore");
    const drawIdx = ctx.calls.indexOf("drawImage");
    expect(drawIdx).toBeGreaterThan(saveIdx);
    expect(drawIdx).toBeLessThan(restoreIdx);
  });

  it("restores alpha to 1 after b-roll draw", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 1, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } },
      theme,
      720,
      1280,
      { image: { width: 100, height: 100 } },
    );
    expect(ctx.drawImageCalls.length).toBeGreaterThan(0);
    expect(ctx.globalAlpha).toBe(1);
  });

  it("keeps popped lines within frame", () => {
    const ctx = stubCtx();
    const text = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
    const tokens = text.split(" ");
    const words = tokens.map((word, i) => ({
      word,
      start: i * 2,
      end: i * 2 + 2,
      cueKind: "hook" as const,
    }));
    drawFrame(
      ctx,
      { t: 5, cue: { start: 0, end: tokens.length * 2, kind: "hook", text } },
      theme,
      720,
      1280,
      { words },
    );
    expect(ctx.textArgs.length).toBeGreaterThan(0);
    ctx.textArgs.forEach(([t, x], i) => {
      ctx.font = ctx.fonts[i] ?? "";
      const w = ctx.measureText!.call(ctx, t).width;
      expect(x + w).toBeLessThanOrEqual(720 - 48 + 1);
    });
  });
});
