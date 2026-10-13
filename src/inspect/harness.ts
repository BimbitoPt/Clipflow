/**
 * Render harness for scripts/video.mjs — drives the real drawFrame() pipeline
 * in a browser page so inspected frames are pixel-identical to preview/export.
 *
 * Not part of the app bundle: loaded only by inspect.html on the dev server.
 */

import { assignCueAssets, preloadCueAssets, type StockAsset } from "../lib/broll";
import { loadPack, type NichePack, type Theme } from "../lib/packs";
import { planFrames, planWords, VIDEO_SECS, type PlannedFrame, type WordCue } from "../lib/planner";
import { MSTUDIO_PROFILE } from "../lib/profile";
import * as renderLib from "../lib/render";
import { drawFrame, type DrawCtx, type RenderExtra } from "../lib/render";
import { buildScript, type VideoScript } from "../lib/script";
import { makeCaptionPlan, suggestSceneLabel, type CaptionMode, type CaptionPhrase } from "../../shared/caption-plan";
import { visualEffectFilters, type VisualEffect } from "../../shared/visual-effects";

const FPS = 30;
const W = 720;
const H = 1280;
const EPS = 2; // px tolerance for text-bounds checks

export interface InspectOpts {
  pack?: string;
  idea?: string;
  asset?: "auto" | "none";
  captions?: CaptionMode;
  voiceOn?: boolean;
  visualEffect?: string;
  cache?: boolean;
  /** Test-only: "throw" makes drawFrame's caller observe a forced fault. */
  fault?: string;
}

export interface Issue {
  level: "error" | "warning";
  code: string;
  t: number;
  cue: string;
  message: string;
}

interface NormOpts {
  pack: string;
  idea: string;
  asset: "auto" | "none";
  captions: CaptionMode;
  voiceOn: boolean;
  visualEffect: VisualEffect;
  cache: boolean;
  fault: string | null;
}

interface Ctx {
  o: NormOpts;
  pack: NichePack;
  theme: Theme;
  script: VideoScript;
  frames: PlannedFrame[];
  words: WordCue[];
  captions: CaptionPhrase[];
  assets: Array<StockAsset | null>;
  totalSecs: number;
}

const DEFAULT_IDEA = "AI receptionists that answer every missed call for local clinics.";
const CAPTION_MODES: CaptionMode[] = ["auto", "scene", "speech", "off"];
const CUE_NAMES = ["hook", "beat1", "beat2", "beat3", "cta"];

function normalize(opts: InspectOpts | undefined): NormOpts {
  const o = opts ?? {};
  const pack = typeof o.pack === "string" && o.pack.length > 0 ? o.pack : "mstudio";
  const idea = typeof o.idea === "string" && o.idea.trim().length > 0 ? o.idea.trim() : DEFAULT_IDEA;
  const asset = o.asset === "none" ? "none" : "auto";
  const captions: CaptionMode = CAPTION_MODES.includes(o.captions as CaptionMode) ? (o.captions as CaptionMode) : "auto";
  const voiceOn = o.voiceOn === true;
  const ve = typeof o.visualEffect === "string" && Object.prototype.hasOwnProperty.call(visualEffectFilters, o.visualEffect)
    ? (o.visualEffect as VisualEffect)
    : "none";
  return { pack, idea, asset, captions, voiceOn, visualEffect: ve, cache: o.cache !== false, fault: typeof o.fault === "string" ? o.fault : null };
}

const ctxCache = new Map<string, Promise<Ctx>>();

async function buildCtx(o: NormOpts): Promise<Ctx> {
  const pack = loadPack(o.pack);
  const theme: Theme = pack.themes[1] ?? pack.themes[0]!;
  const script = buildScript(o.idea, MSTUDIO_PROFILE, pack);
  const frames = planFrames(script, FPS, null);
  const words = planWords(script);
  const labels = script.cues.map((cue) => suggestSceneLabel(cue.text));
  const captions = makeCaptionPlan({ mode: o.captions, voiceOn: o.voiceOn, labels, words, scenes: script.cues });
  let assets: Array<StockAsset | null> = script.cues.map(() => null);
  if (o.asset === "auto") {
    const entries = assignCueAssets(o.idea, MSTUDIO_PROFILE, script.cues.map((cue) => cue.text));
    assets = await preloadCueAssets(entries);
  }
  return { o, pack, theme, script, frames, words, captions, assets, totalSecs: VIDEO_SECS };
}

function getCtx(opts: InspectOpts | undefined): Promise<Ctx> {
  const o = normalize(opts);
  const key = JSON.stringify(o);
  let pending = ctxCache.get(key);
  if (!pending) {
    pending = buildCtx(o);
    ctxCache.set(key, pending);
  }
  return pending;
}

// --- time syntax: 120 (frame), 3.2s, 50%, hook, hook@50%, hook@1.2s, #3, start, end

function cueIndexByName(c: Ctx, name: string): number {
  const i = CUE_NAMES.indexOf(name);
  if (i >= 0) return i;
  if (name === "beat") return 1;
  return -1;
}

function parseTime(spec: string, c: Ctx): number {
  const s = spec.trim().toLowerCase();
  const clamp = (t: number) => Math.max(0, Math.min(c.totalSecs - 1 / FPS, t));
  if (s === "start") return 0;
  if (s === "end") return c.totalSecs - 1 / FPS;
  const byIndex = /^#(\d+)$/.exec(s);
  if (byIndex) {
    const i = Number(byIndex[1]);
    const cue = c.script.cues[i];
    if (!cue) throw new Error(`E_BAD_TIME: no cue #${i}`);
    return clamp(cue.start);
  }
  const secs = /^(\d+(?:\.\d+)?)s$/.exec(s);
  if (secs) return clamp(Number(secs[1]));
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(s);
  if (pct) return clamp((Number(pct[1]) / 100) * c.totalSecs);
  const frames = /^(\d+)$/.exec(s);
  if (frames) return clamp(Number(frames[1]) / FPS);
  const byCue = /^(hook|beat1|beat2|beat3|beat|cta|start|end)(?:@(.*))?$/.exec(s);
  if (byCue && byCue[1] !== "start" && byCue[1] !== "end") {
    const idx = cueIndexByName(c, byCue[1]);
    const cue = c.script.cues[idx];
    if (!cue) throw new Error(`E_BAD_TIME: no cue ${byCue[1]}`);
    const at = byCue[2];
    if (at === undefined || at === "") return clamp(cue.start);
    if (at === "end") return clamp(cue.end - 1 / FPS);
    const atPct = /^(\d+(?:\.\d+)?)%$/.exec(at);
    if (atPct) return clamp(cue.start + (Number(atPct[1]) / 100) * (cue.end - cue.start));
    const atSecs = /^(\d+(?:\.\d+)?)s$/.exec(at);
    if (atSecs) return clamp(cue.start + Number(atSecs[1]));
    const atFrame = /^(\d+)$/.exec(at);
    if (atFrame) return clamp(cue.start + Number(atFrame[1]) / FPS);
    throw new Error(`E_BAD_TIME: ${spec}`);
  }
  throw new Error(`E_BAD_TIME: ${spec}`);
}

/** Range "a..b", a bare cue name (whole cue), or "all". Returns [from, to). */
function parseRange(spec: string | undefined, c: Ctx): [number, number] {
  const s = (spec ?? "all").trim();
  if (s === "all" || s === "") return [0, c.totalSecs];
  const parts = s.split("..");
  if (parts.length === 2) return [parseTime(parts[0]!, c), parseTime(parts[1]!, c)];
  const cueIdx = cueIndexByName(c, s.toLowerCase());
  if (cueIdx >= 0) {
    const cue = c.script.cues[cueIdx]!;
    return [cue.start, cue.end];
  }
  const t = parseTime(s, c);
  return [t, Math.min(c.totalSecs, t + 1 / FPS)];
}

function rangeTimes(spec: string | undefined, n: number, c: Ctx): number[] {
  const [from, to] = parseRange(spec, c);
  const span = Math.max(1 / FPS, to - from);
  const count = Math.max(1, Math.floor(n));
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(Math.min(to - 1 / FPS, from + (span * i) / count));
  return out;
}

function frameAt(t: number, c: Ctx): PlannedFrame {
  const i = Math.max(0, Math.min(c.frames.length - 1, Math.round(t * FPS)));
  return c.frames[i]!;
}

function cueNameOf(frame: PlannedFrame, c: Ctx): string {
  const i = c.script.cues.indexOf(frame.cue);
  return CUE_NAMES[i] ?? frame.cue.kind;
}

// --- instrumentation: ink boxes + transform finiteness + pixel sampling

interface Ink {
  text: string;
  x: number;
  y: number;
  w: number;
  top: number;
  bottom: number;
}

function makeInstrumented(ctx: CanvasRenderingContext2D): { wrapped: DrawCtx; inks: Ink[] } {
  const inks: Ink[] = [];
  const fontSizeOf = (): number => {
    const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
    return m ? Number(m[1]) : 16;
  };
  const wrapped: DrawCtx = {
    get fillStyle() { return ctx.fillStyle as string | CanvasGradient; },
    set fillStyle(v: string | CanvasGradient) { ctx.fillStyle = v; },
    get font() { return ctx.font; },
    set font(v: string) { ctx.font = v; },
    get globalAlpha() { return ctx.globalAlpha; },
    set globalAlpha(v: number) { ctx.globalAlpha = v; },
    get filter() { return ctx.filter; },
    set filter(v: string) { ctx.filter = v; },
    fillRect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
    fillText: (text, x, y, maxWidth) => {
      let w: number;
      let top: number;
      let bottom: number;
      try {
        const m = ctx.measureText(text);
        w = m.width;
        if (maxWidth !== undefined && maxWidth > 0 && w > maxWidth) w = maxWidth;
        const size = fontSizeOf();
        const ascent = Number.isFinite(m.actualBoundingBoxAscent) && m.actualBoundingBoxAscent > 0
          ? m.actualBoundingBoxAscent
          : size;
        const descent = Number.isFinite(m.actualBoundingBoxDescent) && m.actualBoundingBoxDescent > 0
          ? m.actualBoundingBoxDescent
          : size * 0.25;
        top = y - ascent;
        bottom = y + descent;
      } catch {
        w = 0;
        top = y;
        bottom = y;
      }
      inks.push({ text, x, y, w, top, bottom });
      ctx.fillText(text, x, y, maxWidth);
    },
    measureText: (t) => ctx.measureText(t),
    createLinearGradient: (x0, y0, x1, y1) => ctx.createLinearGradient(x0, y0, x1, y1),
    createRadialGradient: (x0, y0, r0, x1, y1, r1) => ctx.createRadialGradient(x0, y0, r0, x1, y1, r1),
    save: () => ctx.save(),
    restore: () => ctx.restore(),
    translate: (x, y) => ctx.translate(x, y),
    scale: (x, y) => ctx.scale(x, y),
    drawImage: (img, dx, dy, dw, dh) => ctx.drawImage(img as CanvasImageSource, dx, dy, dw, dh),
    beginPath: () => ctx.beginPath(),
    arc: (x, y, r, a0, a1, ccw) => ctx.arc(x, y, r, a0, a1, ccw),
    fill: () => ctx.fill(),
  };
  return { wrapped, inks };
}

function sampleGrid(): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) pts.push([x, y]);
  // Explicit rows so the accent bar (top 12px) and progress bar (bottom 14px)
  // always take part in blank/freeze detection.
  for (let x = 0; x < W; x += 16) pts.push([x, 6]);
  for (let x = 0; x < W; x += 16) pts.push([x, H - 7]);
  return pts;
}

const GRID = sampleGrid();

function sampleFrame(ctx: CanvasRenderingContext2D): { uniform: boolean; hash: string } {
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    return { uniform: false, hash: "unreadable" };
  }
  let min = 255;
  let max = 0;
  let h = 2166136261 >>> 0;
  for (const [x, y] of GRID) {
    const i = (y * W + x) * 4;
    for (let k = 0; k < 4; k++) {
      const v = data[i + k]!;
      if (v < min) min = v;
      if (v > max) max = v;
      h ^= v;
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return { uniform: max - min <= 2, hash: String(h) };
}

// --- drawing one frame

interface FrameCheck {
  issues: Issue[];
  hash: string;
}

function applyCacheToggle(cache: boolean): void {
  const toggle = (renderLib as { setFrameCacheEnabled?: (enabled: boolean) => void }).setFrameCacheEnabled;
  if (typeof toggle === "function") toggle(cache);
}

async function drawOne(
  real: CanvasRenderingContext2D,
  frame: PlannedFrame,
  c: Ctx,
  check: boolean,
  skipSeek = false,
): Promise<FrameCheck> {
  const t = frame.t;
  const cue = cueNameOf(frame, c);
  const issues: Issue[] = [];
  const { wrapped, inks } = check ? makeInstrumented(real) : { wrapped: real as unknown as DrawCtx, inks: [] as Ink[] };
  const cueIndex = c.script.cues.indexOf(frame.cue);
  const asset = cueIndex >= 0 ? c.assets[cueIndex] ?? undefined : undefined;
  if (!skipSeek) await seekVideoForFrame(asset, t);
  const extra: RenderExtra = {
    visualEffect: c.o.visualEffect,
    captions: c.captions,
    words: c.words,
    asset,
  };
  try {
    if (c.o.fault === "throw") throw new Error("injected fault (test)");
    drawFrame(wrapped, frame, c.theme, W, H, extra, c.totalSecs);
  } catch (e) {
    issues.push({
      level: "error",
      code: "E_THROW",
      t,
      cue,
      message: `drawFrame threw: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  let hash = "";
  if (check) {
    const m = real.getTransform();
    if (![m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite)) {
      issues.push({ level: "error", code: "E_NAN", t, cue, message: `non-finite transform after drawFrame (${[m.a, m.b, m.c, m.d, m.e, m.f].join(", ")})` });
    }
    for (const ink of inks) {
      if (ink.text.length === 0) continue;
      const outLeft = ink.x < -EPS;
      const outRight = ink.x + ink.w > W + EPS;
      const outTop = ink.top < -EPS;
      const outBottom = ink.bottom > H + EPS;
      if (outLeft || outRight || outTop || outBottom) {
        issues.push({
          level: "warning",
          code: "W_TEXT_OUT",
          t,
          cue,
          message: `text "${ink.text.slice(0, 40)}${ink.text.length > 40 ? "…" : ""}" ink box [${Math.round(ink.x)}..${Math.round(ink.x + ink.w)}]x[${Math.round(ink.top)}..${Math.round(ink.bottom)}] leaves the ${W}x${H} canvas`,
        });
      }
    }
    if (cueIndex >= 0 && c.o.asset === "auto" && !c.assets[cueIndex]) {
      issues.push({ level: "warning", code: "W_ASSET_MISSING", t, cue, message: `b-roll failed to load for ${cue}; drawing gradient fallback` });
    }
    const sample = sampleFrame(real);
    hash = sample.hash;
    if (sample.uniform) {
      issues.push({ level: "warning", code: "W_BLANK", t, cue, message: "frame is uniform (nothing drawn or fully flat)" });
    }
  }
  return { issues, hash };
}

function getCanvas(): { real: CanvasRenderingContext2D; canvas: HTMLCanvasElement } {
  let canvas = document.getElementById("cf-work") as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "cf-work";
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
  }
  const real = canvas.getContext("2d", { willReadFrequently: true });
  if (!real) throw new Error("E_NO_CANVAS: 2d context unavailable");
  return { real, canvas };
}

function clearFrame(real: CanvasRenderingContext2D): void {
  real.save();
  real.setTransform(1, 0, 0, 1, 0, 0);
  real.filter = "none";
  real.globalAlpha = 1;
  real.fillStyle = "#000000";
  real.fillRect(0, 0, W, H);
  real.restore();
}

/**
 * Freeze a video b-roll asset at the frame its timeline position implies.
 * The preload path autoplays videos for preview paint, so without this every
 * drawImage samples whatever frame the wall clock happens to show — parity,
 * inspect, and strip would all differ run-to-run. Export seeks explicitly;
 * the harness now does too.
 */
async function seekVideoForFrame(asset: StockAsset | undefined, t: number): Promise<void> {
  if (!asset || asset.kind !== "video") return;
  const v = asset.el as HTMLVideoElement;
  v.pause();
  const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
  const target = ((t % dur) + dur) % dur;
  const within = () => Math.abs(v.currentTime - target) < 1 / (FPS * 2);
  if (within()) return;
  for (let attempt = 0; attempt < 3 && !within(); attempt++) {
    await seekVideoOnce(v, target);
  }
}

async function seekVideoOnce(v: HTMLVideoElement, target: number): Promise<void> {
  const withFrameCallback = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.removeEventListener("seeked", onSeeked);
      resolve();
    };
    const timer = setTimeout(finish, 500);
    const onSeeked = () => {
      // seeked fires before the seeked frame is presented; drawImage samples
      // the presented frame, so wait for one frame callback after the seek.
      if (typeof withFrameCallback.requestVideoFrameCallback === "function") {
        withFrameCallback.requestVideoFrameCallback(finish);
      } else {
        finish();
      }
    };
    v.addEventListener("seeked", onSeeked, { once: true });
    try {
      v.currentTime = target;
    } catch {
      finish();
    }
  });
}

// --- public API

interface TimelineCue {
  name: string;
  kind: string;
  start: number;
  end: number;
  frameStart: number;
  frameEnd: number;
  variant: string;
  text: string;
}

async function timeline(opts?: InspectOpts) {
  const c = await getCtx(opts);
  const cues: TimelineCue[] = c.script.cues.map((cue, i) => ({
    name: CUE_NAMES[i] ?? cue.kind,
    kind: cue.kind,
    start: cue.start,
    end: cue.end,
    frameStart: Math.round(cue.start * FPS),
    frameEnd: Math.round(cue.end * FPS),
    variant: frameAt((cue.start + cue.end) / 2, c).variant ?? "?",
    text: cue.text,
  }));
  return {
    fps: FPS,
    width: W,
    height: H,
    totalSecs: c.totalSecs,
    pack: c.o.pack,
    theme: c.theme,
    captionMode: c.o.captions,
    assetMode: c.o.asset,
    words: c.words.length,
    captionPhrases: c.captions.length,
    cues,
  };
}

async function inspect(times: number[], opts?: InspectOpts): Promise<{ issues: Issue[]; sampled: number }> {
  const c = await getCtx(opts);
  applyCacheToggle(c.o.cache);
  const { real } = getCanvas();
  const issues: Issue[] = [];
  const hashes: Array<{ t: number; cue: string; hash: string }> = [];
  for (const t of times) {
    const frame = frameAt(t, c);
    clearFrame(real);
    const res = await drawOne(real, frame, c, true);
    issues.push(...res.issues);
    hashes.push({ t, cue: cueNameOf(frame, c), hash: res.hash });
  }
  // Freeze: pixel-identical sampled frames over >= 1.25s of timeline.
  let runStart = 0;
  for (let i = 1; i <= hashes.length; i++) {
    const same = i < hashes.length && hashes[i]!.hash === hashes[runStart]!.hash && hashes[i]!.hash !== "";
    if (same) continue;
    const runLen = i - runStart;
    const span = runLen > 1 ? hashes[i - 1]!.t - hashes[runStart]!.t : 0;
    if (runLen >= 5 && span >= 1.25) {
      const at = hashes[runStart]!;
      issues.push({
        level: "warning",
        code: "W_FREEZE",
        t: at.t,
        cue: at.cue,
        message: `pixels identical across ${runLen} sampled frames (${span.toFixed(2)}s) starting at ${at.t.toFixed(2)}s`,
      });
    }
    runStart = i;
  }
  return { issues, sampled: times.length };
}

async function frames(times: number[], opts?: InspectOpts, withChecks = true) {
  const c = await getCtx(opts);
  applyCacheToggle(c.o.cache);
  const { real, canvas } = getCanvas();
  const out: Array<{ t: number; cue: string; png: string; issues: Issue[] }> = [];
  for (const t of times) {
    const frame = frameAt(t, c);
    clearFrame(real);
    const res = await drawOne(real, frame, c, withChecks);
    out.push({ t: frame.t, cue: cueNameOf(frame, c), png: canvas.toDataURL("image/png"), issues: res.issues });
  }
  return out;
}

async function strip(times: number[], opts?: InspectOpts, columns = 4, cellWidth = 200) {
  const c = await getCtx(opts);
  applyCacheToggle(c.o.cache);
  const { real, canvas } = getCanvas();
  const cellH = Math.round((cellWidth * H) / W);
  const labelH = 18;
  const cols = Math.max(1, Math.floor(columns));
  const rows = Math.ceil(times.length / cols);
  const sheet = document.createElement("canvas");
  sheet.width = cols * cellWidth;
  sheet.height = rows * (cellH + labelH);
  const sctx = sheet.getContext("2d");
  if (!sctx) throw new Error("E_NO_CANVAS: strip context unavailable");
  sctx.fillStyle = "#0b0e12";
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  const cells: Array<{ t: number; cue: string }> = [];
  for (let i = 0; i < times.length; i++) {
    const frame = frameAt(times[i]!, c);
    clearFrame(real);
    await drawOne(real, frame, c, false);
    const cx = (i % cols) * cellWidth;
    const cy = Math.floor(i / cols) * (cellH + labelH);
    sctx.drawImage(canvas, cx, cy, cellWidth, cellH);
    const label = `${cueNameOf(frame, c)} @ ${frame.t.toFixed(2)}s`;
    sctx.fillStyle = "#0b0e12";
    sctx.fillRect(cx, cy + cellH, cellWidth, labelH);
    sctx.fillStyle = "#9bac9b";
    sctx.font = "11px ui-monospace, Consolas, monospace";
    sctx.textBaseline = "middle";
    sctx.fillText(label, cx + 6, cy + cellH + labelH / 2, cellWidth - 12);
    cells.push({ t: frame.t, cue: cueNameOf(frame, c) });
  }
  return { png: sheet.toDataURL("image/png"), cells };
}

async function onion(times: number[], opts?: InspectOpts) {
  const c = await getCtx(opts);
  applyCacheToggle(c.o.cache);
  const { real, canvas } = getCanvas();
  // Running average over the composite: each new frame is blended with
  // weight 1/(i+1), so every frame ends up equally represented.
  clearFrame(real);
  const layer = document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  const lctx = layer.getContext("2d");
  if (!lctx) throw new Error("E_NO_CANVAS: onion layer unavailable");
  for (let i = 0; i < times.length; i++) {
    const frame = frameAt(times[i]!, c);
    clearFrame(lctx);
    await drawOne(lctx, frame, c, false);
    real.globalAlpha = i === 0 ? 1 : 1 / (i + 1);
    real.drawImage(layer, 0, 0);
  }
  real.globalAlpha = 1;
  return { png: canvas.toDataURL("image/png"), times };
}

async function bench(n: number, opts?: InspectOpts, parity = false) {
  const c = await getCtx(opts);
  const { real } = getCanvas();
  const count = Math.max(30, Math.floor(n));
  const run = async (cache: boolean, withHash: boolean) => {
    applyCacheToggle(cache);
    const frameOf = (i: number) => c.frames[i % c.frames.length]!;
    const assetOf = (i: number) => {
      const f = frameOf(i);
      const idx = c.script.cues.indexOf(f.cue);
      return idx >= 0 ? c.assets[idx] ?? undefined : undefined;
    };
    // Freeze every video asset at its first-used frame, from a canonical
    // origin: per-frame seeks race the media pipeline (wall-clock lag) and
    // seek direction can change which picture decodes at the same timestamp.
    // A frozen, canonically-seeked video keeps parity exact while still
    // exercising the drawImage(video) path.
    const frozen = new Set<StockAsset>();
    for (let i = 0; i < count; i++) {
      const asset = assetOf(i);
      if (asset && asset.kind === "video" && !frozen.has(asset)) {
        frozen.add(asset);
        await seekVideoOnce(asset.el as HTMLVideoElement, 0);
        await seekVideoForFrame(asset, frameOf(i).t);
      }
    }
    for (let i = 0; i < 30; i++) {
      clearFrame(real);
      await drawOne(real, frameOf(i), c, false, true);
    }
    const times: number[] = [];
    const hashes: string[] = [];
    const videoStates: Array<{ ct: number; rs: number } | null> = [];
    for (let i = 0; i < count; i++) {
      const frame = frameOf(i);
      const asset = assetOf(i);
      clearFrame(real);
      if (asset && asset.kind === "video") {
        const v = asset.el as HTMLVideoElement;
        videoStates.push({ ct: v.currentTime, rs: v.readyState });
      } else {
        videoStates.push(null);
      }
      const start = performance.now();
      await drawOne(real, frame, c, false, true);
      times.push(performance.now() - start);
      if (withHash) hashes.push(sampleFrame(real).hash);
    }
    times.sort((a, b) => a - b);
    const sum = times.reduce((acc, v) => acc + v, 0);
    return {
      frames: count,
      avgMs: Number((sum / times.length).toFixed(3)),
      p50Ms: Number(times[Math.floor(times.length / 2)]!.toFixed(3)),
      p95Ms: Number(times[Math.floor(times.length * 0.95)]!.toFixed(3)),
      totalMs: Number(sum.toFixed(1)),
      hashes,
      videoStates,
    };
  };
  const cached = await run(c.o.cache || parity, parity);
  if (!parity) {
    applyCacheToggle(c.o.cache);
    const { hashes: _c, videoStates: _v, ...cachedStats } = cached;
    return cachedStats;
  }
  const uncached = await run(false, true);
  let mismatched = 0;
  let firstMismatch = -1;
  let videoChecked = 0;
  const runs: Array<{ from: number; to: number }> = [];
  for (let i = 0; i < cached.hashes.length; i++) {
    const a = cached.videoStates[i] ?? null;
    const b = uncached.videoStates[i] ?? null;
    if (a || b) {
      videoChecked++;
      // Videos are frozen at a canonical position for both passes, so media
      // state must match and pixels are directly comparable. If state
      // diverged anyway (pipeline flake), count it — pixels would lie.
      const stateOk = a && b && Math.abs(a.ct - b.ct) <= 1 / FPS && a.rs >= 2 && b.rs >= 2;
      if (!stateOk) {
        mismatched++;
        if (firstMismatch < 0) firstMismatch = i;
        const last = runs[runs.length - 1];
        if (last && last.to === i - 1) last.to = i;
        else runs.push({ from: i, to: i });
        continue;
      }
    }
    if (cached.hashes[i] !== uncached.hashes[i]) {
      mismatched++;
      if (firstMismatch < 0) firstMismatch = i;
      const last = runs[runs.length - 1];
      if (last && last.to === i - 1) last.to = i;
      else runs.push({ from: i, to: i });
    }
  }
  applyCacheToggle(c.o.cache);
  const { hashes: _c, videoStates: _cv, ...cacheStats } = cached;
  const { hashes: _u, videoStates: _uv, ...noCacheStats } = uncached;
  const badFrame = firstMismatch >= 0 ? c.frames[firstMismatch % c.frames.length] : undefined;
  const badPhrase = badFrame ? c.captions.find((p) => badFrame.t >= p.start && badFrame.t < p.end) : undefined;
  // Re-verify the first mismatch: sequential render (like the cached pass,
  // preceded by earlier frames) vs an isolated render of the same frame.
  // Tells sequential-state pollution from deterministic cache divergence.
  let probe: unknown = null;
  if (firstMismatch >= 0 && badFrame) {
    const snapAt = async (i: number) => {
      clearFrame(real);
      await drawOne(real, c.frames[i % c.frames.length]!, c, false);
      return real.getImageData(0, 0, W, H).data.slice(0);
    };
    applyCacheToggle(true);
    let seq: Uint8ClampedArray | undefined;
    for (let i = Math.max(0, firstMismatch - 10); i <= firstMismatch; i++) seq = await snapAt(i);
    applyCacheToggle(false);
    const iso = await snapAt(firstMismatch);
    applyCacheToggle(c.o.cache);
    let changedSamples = 0;
    let maxDelta = 0;
    for (const [x, y] of GRID) {
      const i = (y * W + x) * 4;
      let diff = false;
      for (let k = 0; k < 4; k++) {
        const d = Math.abs((seq ?? [])[i + k]! - iso[i + k]!);
        if (d > 0) diff = true;
        if (d > maxDelta) maxDelta = d;
      }
      if (diff) changedSamples++;
    }
    probe = { changedSamples, totalSamples: GRID.length, maxDelta };
  }
  return {
    cache: cacheStats,
    noCache: noCacheStats,
    parity: {
      compared: cached.hashes.length,
      mismatched,
      videoChecked,
      firstMismatch,
      runs: runs.slice(0, 12),
      atT: badFrame?.t,
      phrase: badPhrase ? { kind: badPhrase.kind, text: badPhrase.text } : null,
      sample: firstMismatch >= 0 ? { cached: cached.hashes[firstMismatch], uncached: uncached.hashes[firstMismatch] } : undefined,
      probe,
    },
  };
}

async function parseTimes(specs: string[], opts?: InspectOpts): Promise<number[]> {
  const c = await getCtx(opts);
  return specs.map((s) => parseTime(s, c));
}

async function parseRangeTimes(spec: string | undefined, n: number, opts?: InspectOpts): Promise<number[]> {
  const c = await getCtx(opts);
  return rangeTimes(spec, n, c);
}

async function parseRangeBounds(spec: string | undefined, opts?: InspectOpts): Promise<[number, number]> {
  const c = await getCtx(opts);
  return parseRange(spec, c);
}

/**
 * Measure the two desktop frame transports on real rendered frames.
 *
 * `png` is what shipped: `canvas.toDataURL("image/png")` plus the base64 split,
 * one IPC call per frame. `raw` is the replacement: `getImageData` plus a copy
 * into a fixed batch buffer, several frames per call.
 *
 * Also checks that both transports agree byte for byte. `toDataURL` encodes
 * the same canvas `getImageData` reads and PNG is lossless, so any difference
 * here would mean dropping the PNG round trip silently changes exported pixels.
 */
async function transport(n: number, opts?: InspectOpts) {
  const c = await getCtx(opts);
  const { real, canvas } = getCanvas();
  const count = Math.max(1, Math.floor(n));
  const frameBytes = W * H * 4;
  const frameOf = (i: number) => c.frames[i % c.frames.length]!;
  const assetOf = (i: number) => {
    const f = frameOf(i);
    const idx = c.script.cues.indexOf(f.cue);
    return idx >= 0 ? c.assets[idx] ?? undefined : undefined;
  };
  // Freeze videos once, as bench does, so the two passes draw identical pixels.
  const frozen = new Set<StockAsset>();
  for (let i = 0; i < count; i++) {
    const asset = assetOf(i);
    if (asset && asset.kind === "video" && !frozen.has(asset)) {
      frozen.add(asset);
      await seekVideoOnce(asset.el as HTMLVideoElement, 0);
      await seekVideoForFrame(asset, frameOf(i).t);
    }
  }
  // Warm up both paths so the first measured frame is not paying JIT/codec cost.
  for (let i = 0; i < 8; i++) {
    clearFrame(real);
    await drawOne(real, frameOf(i), c, false, true);
    canvas.toDataURL("image/png");
    real.getImageData(0, 0, W, H);
  }

  const pngMs: number[] = [];
  const rawMs: number[] = [];
  const copyMs: number[] = [];
  let pngBytes = 0;
  let rawBytes = 0;
  let mismatched = 0;
  let firstMismatch = -1;
  let peakBatchBytes = 0;
  const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
  // Sampled around each path separately: toDataURL builds a ~5 MB base64 string
  // per frame, the raw path builds none, so the delta is the point.
  let pngPeakHeap = 0;
  let rawPeakHeap = 0;
  // Two slots, exactly as FrameBatcher allocates: 4 frames x 720x1280x4.
  const slots = [new Uint8Array(frameBytes * 4), new Uint8Array(frameBytes * 4)];
  const samplePng: string[] = [];

  const scratch = document.createElement("canvas");
  scratch.width = W;
  scratch.height = H;
  const sctx = scratch.getContext("2d", { willReadFrequently: true })!;

  // Only the first frames get the parity probe: re-decoding a PNG and
  // comparing 3.7 MB of pixels costs more than the timing loops themselves.
  const PARITY_FRAMES = 12;
  // Frames handed to the Node side, which replays them through both FFmpeg
  // demuxers. Enough to get past encoder startup into steady state.
  const SAMPLE_FRAMES = 30;
  for (let i = 0; i < count; i++) {
    clearFrame(real);
    await drawOne(real, frameOf(i), c, false, true);

    const t0 = performance.now();
    const h0 = heap();
    const dataUrl = canvas.toDataURL("image/png");
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    pngMs.push(performance.now() - t0);
    pngPeakHeap = Math.max(pngPeakHeap, heap() - h0);
    pngBytes += b64.length;
    if (samplePng.length < SAMPLE_FRAMES) samplePng.push(b64);

    const t1 = performance.now();
    const h1 = heap();
    const img = real.getImageData(0, 0, W, H);
    rawMs.push(performance.now() - t1);

    const t2 = performance.now();
    const slot = slots[i % 2]!;
    slot.set(img.data, 0);
    copyMs.push(performance.now() - t2);
    rawPeakHeap = Math.max(rawPeakHeap, heap() - h1);
    rawBytes += frameBytes;
    peakBatchBytes = Math.max(peakBatchBytes, frameBytes * 4);

    // Parity: re-decode the PNG we just produced and compare to raw pixels.
    if (i < PARITY_FRAMES) {
      const blob = await (await fetch(dataUrl)).blob();
      const bmp = await createImageBitmap(blob);
      sctx.clearRect(0, 0, W, H);
      sctx.drawImage(bmp, 0, 0);
      bmp.close();
      const roundTrip = sctx.getImageData(0, 0, W, H).data;
      for (let k = 0; k < frameBytes; k++) {
        if (roundTrip[k] !== img.data[k]) {
          mismatched++;
          if (firstMismatch < 0) firstMismatch = i;
          break;
        }
      }
    }
  }
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  return {
    frames: count, width: W, height: H, frameBytes,
    png: {
      totalMs: +sum(pngMs).toFixed(1), avgMs: +(sum(pngMs) / count).toFixed(3),
      bytes: pngBytes, ipcCalls: count, peakHeapBytes: pngPeakHeap,
    },
    raw: {
      totalMs: +(sum(rawMs) + sum(copyMs)).toFixed(1),
      getImageDataMs: +(sum(rawMs) / count).toFixed(3),
      copyMs: +(sum(copyMs) / count).toFixed(3),
      avgMs: +((sum(rawMs) + sum(copyMs)) / count).toFixed(3),
      bytes: rawBytes, ipcCalls: Math.ceil(count / 4), peakBatchBytes, peakHeapBytes: rawPeakHeap,
    },
    parity: { checked: Math.min(PARITY_FRAMES, count), mismatched, firstMismatch },
    samplePng,
    heapAvailable: heap() > 0,
  };
}

export interface HarnessApi {
  timeline: typeof timeline;
  inspect: typeof inspect;
  frames: typeof frames;
  strip: typeof strip;
  onion: typeof onion;
  bench: typeof bench;
  parseTimes: typeof parseTimes;
  parseRangeTimes: typeof parseRangeTimes;
  parseRangeBounds: typeof parseRangeBounds;
  transport: typeof transport;
}

window.__cf = { timeline, inspect, frames, strip, onion, bench, parseTimes, parseRangeTimes, parseRangeBounds, transport };

declare global {
  interface Window {
    __cf: HarnessApi;
  }
}
