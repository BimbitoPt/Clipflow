import { describe, expect, it } from "vitest";
import { drawFrame, drawScene, findActiveWord, hookHeadline, CAPTION_ANCHOR_RATIO, CREDIT_SECS, HOOK_CARD_SECS, HOOK_CARD_WORDS, type DrawCtx } from "./render";
import { planFrames, type SceneVariant } from "./planner";
import type { VideoScript } from "./script";
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
    const long = "x".repeat(200); // 200-char single token forces shrink
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

  it("scales progress and zoom to a custom total", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 37.1, cue: { start: 32.1, end: 37.1, kind: "cta", text: "Hello niche" } },
      theme,
      720,
      1280,
      undefined,
      37.1,
    );
    const full = ctx.rects.filter(([, , w]) => Math.abs(w - 720) <= 2);
    expect(full.length).toBeGreaterThan(0);
  });

  it("holds the complete speech phrase without word-size jumps", () => {
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
    expect(ctx.texts[0]).toEqual("Hello niche");
    // Karaoke emphasis: the sounding word is overdrawn in accent.
    expect(ctx.texts).toContain("niche");
    expect(ctx.accents).toContain(theme.accent);
  });

  it("shows a stable phrase instead of a sliding neighbor window", () => {
    const ctx = stubCtx();
    const tokens = ["a", "b", "c", "d", "e"];
    const words = tokens.map((word, i) => ({
      word,
      start: i,
      end: i + 1,
      cueKind: "hook" as const,
    }));
    drawFrame(
      ctx,
      { t: 2.5, cue: { start: 0, end: 5, kind: "hook", text: "a b c d e" } },
      theme,
      720,
      1280,
      { words },
    );
    expect(ctx.texts[0]).toEqual("a b c d e");
    expect(ctx.texts).toContain("c");
    expect(ctx.accents).toContain(theme.accent);
  });

  it("follows voice-timed words outside their cue window", () => {
    const ctx = stubCtx();
    // Hook spoken 0-8s while its caption cue is 0-4s: at t=6 the caption
    // must still follow the hook voice, not jump to beat words.
    const words = [
      { word: "slow", start: 5.0, end: 5.5, cueKind: "hook" as const },
      { word: "sites", start: 5.5, end: 6.0, cueKind: "hook" as const },
      { word: "kill", start: 6.0, end: 6.5, cueKind: "hook" as const },
      { word: "beat", start: 7.0, end: 7.5, cueKind: "beat" as const },
    ];
    drawFrame(
      ctx,
      { t: 6.2, cue: { start: 4, end: 16, kind: "beat", text: "beat words here" } },
      theme,
      720,
      1280,
      { words },
    );
    expect(ctx.texts[0]).toEqual("slow sites kill");
    expect(ctx.texts.join(" ")).not.toContain("beat");
    expect(ctx.texts).toContain("kill");
    expect(ctx.accents).toContain(theme.accent);
  });

  it("keeps phrase captions inside the platform safe zone", () => {
    const ctx = stubCtx();
    const words = [
      { word: "slow", start: 5.0, end: 5.5, cueKind: "hook" as const },
      { word: "sites", start: 5.5, end: 6.0, cueKind: "hook" as const },
      { word: "kill", start: 6.0, end: 6.5, cueKind: "hook" as const },
    ];
    drawFrame(
      ctx,
      { t: 6.2, cue: { start: 4, end: 16, kind: "beat", text: "beat words here" } },
      theme,
      720,
      1280,
      { words },
    );
    // Platform UI covers the top ~9% and bottom ~18%: no caption text
    // may sit outside the safe band.
    expect(ctx.textArgs.length).toBeGreaterThan(0);
    for (const [, , y] of ctx.textArgs) {
      expect(y).toBeGreaterThanOrEqual(1280 * 0.09);
      expect(y).toBeLessThan(1280 * 0.82);
    }
    // The caption scrim box must also end above the bottom danger zone.
    const boxes = ctx.rects.filter(([, y, w, h]) => w > 100 && h > 10 && y > 1280 * 0.3);
    expect(boxes.length).toBeGreaterThan(0);
    for (const [, y, , h] of boxes) expect(y + h).toBeLessThan(1280 * 0.82);
  });

  it("never highlights scene labels — only word-timed speech", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 2, cue: { start: 0, end: 4, kind: "hook", text: "hook copy here" } },
      theme,
      720,
      1280,
      {
        words: [{ word: "hook", start: 1, end: 2, cueKind: "hook" as const }],
        captions: [{ text: "Custom Scene Label", start: 0, end: 4, kind: "scene" as const }],
      },
    );
    expect(ctx.texts[0]).toEqual("CUSTOM SCENE LABEL");
  });

  it("anchors the no-caption fallback in the safe zone over footage", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 1, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } },
      theme,
      720,
      1280,
      {
        asset: {
          kind: "video",
          src: "/broll/clips/clip-1.mp4",
          el: { videoWidth: 720, videoHeight: 1280 } as unknown as HTMLVideoElement,
          keywords: [],
        },
      },
    );
    expect(ctx.textArgs.length).toBeGreaterThan(0);
    expect(ctx.textArgs[0]![2]).toEqual(1280 * CAPTION_ANCHOR_RATIO);
  });

  it("findActiveWord holds the last started word", () => {
    const words = [
      { word: "a", start: 0, end: 1, cueKind: "hook" as const },
      { word: "b", start: 1, end: 2, cueKind: "hook" as const },
      { word: "c", start: 2, end: 3, cueKind: "hook" as const },
    ];
    expect(findActiveWord(words, 0.5)).toEqual("a");
    expect(findActiveWord(words, 2.9)).toEqual("c");
    expect(findActiveWord(words, 9)).toEqual("c");
    expect(findActiveWord(words, -1)).toBeUndefined();
    expect(findActiveWord([], 1)).toBeUndefined();
  });

  it("holds a hook card over the opening seconds", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 1, cue: { start: 0, end: 4, kind: "hook", text: "Slow sites cost you sales every single week" } },
      theme,
      720,
      1280,
    );
    expect(ctx.texts).toContain("Slow sites cost you sales every single week");
    // Plate lives in the top band, far from captions and platform UI.
    // (Background and accent-bar rects also touch y=0 — filter by plate size.)
    const plates = ctx.rects.filter(([, y, , h]) => y > 20 && y < 1280 * 0.3 && h > 20 && h < 1280 * 0.1);
    expect(plates.length).toBeGreaterThan(0);
  });

  it("drops the hook card after the opening seconds", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 10, cue: { start: 4, end: 16, kind: "beat", text: "Owning the result beats renting attention" } },
      theme,
      720,
      1280,
    );
    expect(ctx.texts).not.toContain("Owning the result beats renting attention");
    expect(ctx.rects.filter(([, y, , h]) => y > 20 && y < 1280 * 0.3 && h > 20 && h < 1280 * 0.1).length).toBe(0);
  });

  it("truncates the hook card to a blunt headline", () => {
    const long = "one two three four five six seven eight nine ten eleven twelve";
    expect(hookHeadline(long).split(" ").length).toBeLessThanOrEqual(HOOK_CARD_WORDS);
    expect(hookHeadline(long)).toBe("one two three four five six seven eight");
    expect(HOOK_CARD_SECS).toBe(4);
  });

  it("shrinks an overlong hook headline to fit the frame", () => {
    const ctx = stubCtx();
    const full = hookHeadline("supercalifragilistic experimental phenomenology extraordinary situation extra words here");
    drawFrame(
      ctx,
      { t: 1, cue: { start: 0, end: 4, kind: "hook", text: "supercalifragilistic experimental phenomenology extraordinary situation extra words here" } },
      theme,
      720,
      1280,
    );
    // Split across two plate lines; first line carries the opening words.
    expect(ctx.texts).toContain("supercalifragilistic experimental phenomenology extraordinary");
    const at = ctx.texts.indexOf("supercalifragilistic experimental phenomenology extraordinary");
    const px = Number(/(\d+)px/.exec(ctx.fonts[at] ?? "")?.[1]);
    expect(px).toBeLessThan(Math.round(720 * 0.052));
    expect(full.split(" ").length).toBeLessThanOrEqual(8);
  });

  it("fits the hook card inside the frame at preview width", () => {
    const ctx = stubCtx();
    const text = "Posting daily is the whole game. Posting daily";
    drawFrame(
      ctx,
      { t: 1, cue: { start: 0, end: 4, kind: "hook", text } },
      theme,
      360,
      640,
    );
    const top = ctx.textArgs.filter(([, , y]) => y < 640 * 0.3).map(([t]) => t);
    // Whole headline present, no spill past the plate band.
    expect(top.join(" ")).toBe(text);
    ctx.textArgs.forEach(([line, x, y], index) => {
      if (y >= 640 * 0.3) return;
      const size = Number(/(\d+)px/.exec(ctx.fonts[index] ?? "")?.[1] ?? 0);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(line.length * size * 0.55).toBeLessThanOrEqual(360 * 0.86 + 1);
    });
  });

  it("draws the opt-in credit card with no captions", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 46, cue: { start: 40, end: 45, kind: "cta", text: "Book now today" } },
      theme,
      720,
      1280,
      {
        endCard: true,
        words: [{ word: "Book", start: 46, end: 46.5, cueKind: "cta" as const }],
        captions: [{ text: "Book now today", start: 40, end: 47, kind: "speech" as const }],
      },
    );
    expect(ctx.texts).toEqual(["MADE WITH", "CLIPFLOW"]);
    expect(CREDIT_SECS).toBe(2);
  });

  it("dips to brand dark across cue boundaries, never mid-cue", () => {
    const near = stubCtx();
    drawFrame(
      near,
      { t: 4.05, cue: { start: 4, end: 16, kind: "beat", text: "beat words here" } },
      theme,
      720,
      1280,
    );
    // edge = 0.05s into the cue -> alpha = 0.7 * (1 - 0.05/0.15)^2 ~= 0.311
    const dip = near.globalAlphaValues.filter((a) => a > 0.2 && a < 0.7);
    expect(dip.length).toBeGreaterThan(0);
    expect(Math.abs(dip[0]! - 0.311)).toBeLessThan(0.01);
    expect(near.globalAlpha).toBe(1);

    const mid = stubCtx();
    drawFrame(
      mid,
      { t: 10, cue: { start: 4, end: 16, kind: "beat", text: "beat words here" } },
      theme,
      720,
      1280,
    );
    expect(mid.globalAlphaValues.filter((a) => a > 0.2 && a < 0.7).length).toBe(0);
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
      { asset: { kind: "image", src: "/broll/1.jpg", el: { width: 100, height: 100 } as unknown as ImageBitmap, keywords: [] } },
    );
    expect(ctx.drawImageCalls.length).toBeGreaterThan(0);
    expect(ctx.globalAlphaValues).toContain(0.55);
  });

  it("keeps video footage visible without the still-image scrim or extra zoom", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 1, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } },
      theme,
      720,
      1280,
      {
        asset: {
          kind: "video",
          src: "/broll/clips/clip-1.mp4",
          el: { videoWidth: 720, videoHeight: 1280 } as unknown as HTMLVideoElement,
          keywords: [],
        },
      },
    );
    expect(ctx.drawImageCalls.length).toBeGreaterThan(0);
    expect(ctx.globalAlphaValues).not.toContain(0.55);
    expect(ctx.globalAlphaValues.some((alpha) => alpha > 0 && alpha < 0.25)).toBe(true);
  });

  it("balances save/restore with b-roll inside zoom", () => {
    const ctx = stubCtx();
    drawFrame(
      ctx,
      { t: 10, cue: { start: 0, end: 4, kind: "hook", text: "Hello niche" } },
      theme,
      720,
      1280,
      { asset: { kind: "image", src: "/broll/1.jpg", el: { width: 100, height: 100 } as unknown as ImageBitmap, keywords: [] } },
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
      { asset: { kind: "image", src: "/broll/1.jpg", el: { width: 100, height: 100 } as unknown as ImageBitmap, keywords: [] } },
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

  it("paints each scene variant without throw (full stub)", () => {
    const variants: SceneVariant[] = ["rays", "blobs", "grid", "waves", "pulse"];
    for (const variant of variants) {
      const ctx = stubCtx();
      expect(() => drawScene(ctx, variant, 5, 720, 1280, theme.accent)).not.toThrow();
      expect(() =>
        drawFrame(ctx, { t: 5, variant, cue: { start: 0, end: 4, kind: "hook", text: "Hi" } }, theme),
      ).not.toThrow();
    }
  });

  it("paints each scene variant without throw (bare stub)", () => {
    const variants: SceneVariant[] = ["rays", "blobs", "grid", "waves", "pulse"];
    for (const variant of variants) {
      const bare = {
        fillStyle: "",
        font: "",
        fillRect(_x: number, _y: number, _w: number, _h: number) {},
        fillText(_t: string, _x: number, _y: number) {},
      } as unknown as DrawCtx;
      expect(() => drawScene(bare, variant, 5, 720, 1280, theme.accent)).not.toThrow();
    }
  });

  it("renders different call counts for rays vs blobs", () => {
    const raysCtx = stubCtx();
    drawScene(raysCtx, "rays", 5, 720, 1280, theme.accent);
    const blobsCtx = stubCtx();
    drawScene(blobsCtx, "blobs", 5, 720, 1280, theme.accent);
    const raysArcs = raysCtx.calls.filter((c) => c === "arc").length;
    const blobsArcs = blobsCtx.calls.filter((c) => c === "arc").length;
    expect(raysArcs).toBeGreaterThan(0);
    expect(blobsArcs).toBeGreaterThan(0);
    expect(raysCtx.calls.length).not.toBe(blobsCtx.calls.length);
    expect(raysArcs).not.toBe(blobsArcs);
  });

  it("assigns scene variants by cue order (rays→hook, blobs/grid/waves→beats, pulse→cta)", () => {
    const script: VideoScript = {
      hook: "hook",
      beats: ["b1", "b2", "b3"],
      cta: "cta",
      cues: [
        { start: 0, end: 4, kind: "hook", text: "hook" },
        { start: 4, end: 16, kind: "beat", text: "b1" },
        { start: 16, end: 28, kind: "beat", text: "b2" },
        { start: 28, end: 40, kind: "beat", text: "b3" },
        { start: 40, end: 45, kind: "cta", text: "cta" },
      ],
      linkedin: { variants: ["hook", "b", "c"] as [string, string, string], body: "", hashtags: [] },
    };
    const frames = planFrames(script, 30);
    expect(frames[0]!.variant).toBe("rays");
    expect(frames[4 * 30]!.variant).toBe("blobs");
    expect(frames[16 * 30]!.variant).toBe("grid");
    expect(frames[28 * 30]!.variant).toBe("waves");
    expect(frames[40 * 30]!.variant).toBe("pulse");
  });

  it("wraps 4th+ beat back to blobs", () => {
    const script: VideoScript = {
      hook: "hook",
      beats: ["b1", "b2", "b3"],
      cta: "cta",
      cues: [
        { start: 0, end: 4, kind: "hook", text: "hook" },
        { start: 4, end: 12, kind: "beat", text: "b1" },
        { start: 12, end: 20, kind: "beat", text: "b2" },
        { start: 20, end: 28, kind: "beat", text: "b3" },
        { start: 28, end: 36, kind: "beat", text: "b4" },
        { start: 36, end: 45, kind: "cta", text: "cta" },
      ],
      linkedin: { variants: ["hook", "b", "c"] as [string, string, string], body: "", hashtags: [] },
    };
    const frames = planFrames(script, 30);
    expect(frames[4 * 30]!.variant).toBe("blobs");
    expect(frames[12 * 30]!.variant).toBe("grid");
    expect(frames[20 * 30]!.variant).toBe("waves");
    expect(frames[28 * 30]!.variant).toBe("blobs");
    expect(frames[36 * 30]!.variant).toBe("pulse");
  });
});
