import type { Theme } from "./packs";
import { VIDEO_SECS, type PlannedFrame, type SceneVariant, type WordCue } from "./planner";
import { assetSize, type StockAsset } from "./broll";
import { drawMotionGraphic } from "./motion-graphics";
import { resolveMotionIntent } from "./motion-intent";
import { speechPhrases, type CaptionPhrase } from "../../shared/caption-plan";
import { visualEffectFilters, type VisualEffect } from "../../shared/visual-effects";

export interface BrollImage {
  width: number;
  height: number;
}

export interface RenderExtra {
  asset?: StockAsset;
  words?: WordCue[];
  captions?: readonly CaptionPhrase[];
  visualEffect?: VisualEffect;
  /** Per-platform caption baseline override (0.60-0.70); defaults to CAPTION_ANCHOR_RATIO. */
  captionAnchor?: number;
  /** Opt-in credit card: replaces the whole frame, no captions or b-roll. */
  endCard?: boolean;
}

/** Length of the opt-in credit card appended to exports. */
export const CREDIT_SECS = 2;

function drawEndCard(ctx: DrawCtx, W: number, H: number, accent: string) {
  ctx.fillStyle = "#080A0D";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 12);
  ctx.fillRect(0, H - 14, W, 14);
  const mark = "CLIPFLOW";
  const over = "MADE WITH";
  const markSize = Math.round(W * 0.11);
  const overSize = Math.round(W * 0.032);
  ctx.font = `900 ${markSize}px system-ui, sans-serif`;
  const measure = (text: string, size: number) => ctx.measureText?.(text).width ?? text.length * size * 0.55;
  ctx.fillStyle = "#9BAC9B";
  ctx.font = `700 ${overSize}px ui-monospace, Consolas, monospace`;
  ctx.fillText(over, (W - measure(over, overSize)) / 2, H * 0.46);
  ctx.font = `900 ${markSize}px system-ui, sans-serif`;
  ctx.fillStyle = "#F2F5ED";
  ctx.fillText(mark, (W - measure(mark, markSize)) / 2, H * 0.53);
  ctx.fillStyle = accent;
  const barW = W * 0.2;
  ctx.fillRect((W - barW) / 2, H * 0.57, barW, 6);
}

export interface DrawCtx {
  fillStyle: string | CanvasGradient;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText?(text: string): { width: number };
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
  createRadialGradient?(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
  save?(): void;
  restore?(): void;
  translate?(x: number, y: number): void;
  scale?(x: number, y: number): void;
  drawImage?(img: BrollImage | ImageBitmap | HTMLVideoElement, dx: number, dy: number, dw: number, dh: number): void;
  globalAlpha?: number;
  filter?: string;
  beginPath?(): void;
  arc?(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  fill?(): void;
}

interface GradientLike {
  addColorStop(o: number, c: string): void;
}

function words(text: string, max = 8): string[] {
  const tokens: string[] = [];
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    if (tok.length <= 24) {
      tokens.push(tok);
    } else {
      for (let i = 0; i < tok.length; i += 24) tokens.push(tok.slice(i, i + 24));
    }
  }
  const lines: string[] = [];
  for (let i = 0; i < tokens.length; i += max) lines.push(tokens.slice(i, i + max).join(" "));
  if (lines.length <= 4) return lines.slice(0, 4);
  const kept = lines.slice(0, 4);
  if (!kept[3]!.endsWith("…")) kept[3] = `${kept[3]}…`;
  return kept;
}

function parseBaseSize(font: string, fallback = 96): number {
  const m = /700\s+(\d+)px/.exec(font) ?? /(\d+)px/.exec(font);
  if (!m) return fallback;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function fontFor(baseFont: string, size: number): string {
  if (/\d+px/.test(baseFont)) return baseFont.replace(/\d+px/, `${size}px`);
  return `700 ${size}px system-ui, sans-serif`;
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    if (tok.length <= 24) {
      tokens.push(tok);
    } else {
      for (let i = 0; i < tok.length; i += 24) tokens.push(tok.slice(i, i + 24));
    }
  }
  return tokens;
}

function wrapMeasured(text: string, maxW: number, measure: (s: string) => number): string[] {
  const tokens = tokenize(text);
  const lines: string[] = [];
  let cur = "";
  for (const tok of tokens) {
    const trial = cur ? `${cur} ${tok}` : tok;
    if (measure(trial) <= maxW || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = tok;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= 5) return lines;
  const kept = lines.slice(0, 5);
  if (!kept[4]!.endsWith("…")) kept[4] = `${kept[4]}…`;
  return kept;
}

/**
 * Caption baseline anchor as a fraction of frame height. 0.64 keeps the
 * caption block (~0.60-0.75H) clear of the platform UI danger zone:
 * TikTok/Reels/Shorts overlays cover roughly the bottom 18-20% and the
 * top 9%, so captions must never sit at the old 0.79H baseline.
 */
export const CAPTION_ANCHOR_RATIO = 0.64;

/** Latest word sounding at time t (karaoke hold: keeps the last started word). */
export function findActiveWord(wordList: readonly WordCue[], t: number): string | undefined {
  let cur: string | undefined;
  let curStart = -Infinity;
  for (const w of wordList) {
    if (w.start <= t && w.start >= curStart) {
      cur = w.word;
      curStart = w.start;
    }
  }
  return cur;
}

function drawPhraseCaption(ctx: DrawCtx, phrase: CaptionPhrase, time: number, W: number, H: number, accent: string, activeWord?: string, anchorRatio: number = CAPTION_ANCHOR_RATIO) {
  const value = phrase.kind === "scene" ? phrase.text.toUpperCase() : phrase.text;
  const maxWidth = W * .78;
  let size = W * (phrase.kind === "scene" ? .065 : .07);
  let lines = [value];
  for (; size >= W * .034; size -= 1) {
    ctx.font = `700 ${Math.round(size)}px system-ui, sans-serif`;
    const measure = (text: string) => ctx.measureText?.(text).width ?? text.length * size * .55;
    lines = wrapMeasured(value, maxWidth, measure);
    if (lines.length <= 2 && lines.every(line => measure(line) <= maxWidth)) break;
  }
  const lineHeight = size * 1.22;
  // Platform presets nudge the baseline inside the safe band; clamp so a
  // bad value can never push captions under a platform overlay.
  const anchor = Math.min(0.7, Math.max(0.6, anchorRatio));
  const y = H * anchor;
  const fade = Math.max(0, Math.min(1, (time - phrase.start) / .12, (phrase.end - time) / .12));
  const previousAlpha = ctx.globalAlpha ?? 1;
  try {
    ctx.globalAlpha = fade;
    const measure = (text: string) => ctx.measureText?.(text).width ?? text.length * size * .55;
    const boxW = Math.min(W * .86, Math.max(...lines.map(measure)) + W * .045);
    ctx.fillStyle = "#080A0D";
    ctx.globalAlpha = fade * .7;
    ctx.fillRect((W - boxW) / 2, y - size, boxW, lineHeight * lines.length + W * .03);
    ctx.globalAlpha = fade;
    ctx.fillStyle = "#F7F8FA";
    lines.forEach((line,index) => ctx.fillText(line, (W - measure(line)) / 2, y + index * lineHeight));
    // Karaoke emphasis: overdraw the sounding word in accent at 1.15x.
    // Only for speech phrases — scene labels are whole-cue text with no
    // word timing, so there is nothing truthful to highlight.
    if (phrase.kind === "speech" && activeWord) {
      try {
        const lineIndex = lines.findIndex((line) => line.split(" ").includes(activeWord));
        if (lineIndex >= 0) {
          const line = lines[lineIndex]!;
          const tokens = line.split(" ");
          const hit = tokens.indexOf(activeWord);
          const before = tokens.slice(0, hit).join(" ");
          const x = (W - measure(line)) / 2 + (hit > 0 ? measure(`${before} `) : 0);
          ctx.font = `700 ${Math.round(size * 1.15)}px system-ui, sans-serif`;
          ctx.fillStyle = accent;
          ctx.fillText(activeWord, x, y + lineIndex * lineHeight);
        }
      } catch {
        // Emphasis is decorative; the base phrase already painted.
      }
    }
    if (phrase.kind === "scene") {
      ctx.fillStyle = accent;
      ctx.fillRect((W - boxW) / 2, y - size, W * .004, lineHeight * lines.length + W * .03);
    }
  } finally { ctx.globalAlpha = previousAlpha; }
}

export const HOOK_CARD_WORDS = 8;
export const HOOK_CARD_SECS = 4;
/** Hook-card baseline: top band, clear of the caption zone and faces. */
export const HOOK_CARD_RATIO = 0.16;

/** Blunt promise of the clip: first HOOK_CARD_WORDS of the hook cue. */
export function hookHeadline(text: string): string {
  return text.split(/\s+/).filter(Boolean).slice(0, HOOK_CARD_WORDS).join(" ");
}

function drawHookCard(ctx: DrawCtx, headline: string, elapsed: number, W: number, H: number, accent: string) {
  const size = Math.max(20, Math.round(W * 0.052));
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  const measure = (text: string) => ctx.measureText?.(text).width ?? text.length * size * 0.55;
  const padX = W * 0.035;
  const boxW = Math.min(W * 0.9, measure(headline) + padX * 2);
  const boxH = size * 1.7;
  const y = H * HOOK_CARD_RATIO - boxH / 2;
  const fade = Math.max(0, Math.min(1, elapsed / 0.25, (HOOK_CARD_SECS - elapsed) / 0.5));
  const previousAlpha = ctx.globalAlpha ?? 1;
  try {
    ctx.globalAlpha = fade * 0.85;
    ctx.fillStyle = "#080A0D";
    ctx.fillRect((W - boxW) / 2, y, boxW, boxH);
    ctx.globalAlpha = fade;
    ctx.fillStyle = accent;
    ctx.fillRect((W - boxW) / 2, y + boxH - 4, boxW, 4);
    ctx.fillStyle = "#F7F8FA";
    ctx.fillText(headline, (W - measure(headline)) / 2, y + boxH / 2 + size * 0.35);
  } finally {
    ctx.globalAlpha = previousAlpha;
  }
}

export function variantForKind(kind: PlannedFrame["cue"]["kind"]): SceneVariant {
  return kind === "hook" ? "rays" : kind === "cta" ? "pulse" : "blobs";
}

function setSceneFill(ctx: DrawCtx, color: string): void {
  try {
    ctx.fillStyle = color;
  } catch {
    // Scene fill must never throw.
  }
}

function setSceneAlpha(ctx: DrawCtx, alpha: number): void {
  try {
    ctx.globalAlpha = alpha;
  } catch {
    // Alpha must never throw.
  }
}

function resetSceneAlpha(ctx: DrawCtx): void {
  try {
    ctx.globalAlpha = 1;
  } catch {
    // Never throw while restoring alpha.
  }
}

function paintRays(ctx: DrawCtx, t: number, W: number, H: number, accent: string): void {
  if (typeof ctx.beginPath !== "function" || typeof ctx.arc !== "function" || typeof ctx.fill !== "function") return;
  setSceneFill(ctx, accent);
  setSceneAlpha(ctx, 0.06);
  try {
    const cx = W / 2;
    const cy = H;
    const R = Math.max(W, H);
    const off = t * 0.1;
    for (let i = 0; i < 12; i++) {
      const a0 = off + (i * Math.PI * 2) / 12;
      const a1 = a0 + Math.PI / 24;
      try {
        ctx.beginPath!();
        ctx.arc!(cx, cy, R, a0, a1);
        ctx.fill!();
      } catch {
        // Skip wedge, never throw.
      }
    }
  } finally {
    resetSceneAlpha(ctx);
  }
}

function paintBlobs(ctx: DrawCtx, t: number, W: number, H: number, accent: string): void {
  if (typeof ctx.beginPath !== "function" || typeof ctx.arc !== "function" || typeof ctx.fill !== "function") return;
  setSceneFill(ctx, accent);
  setSceneAlpha(ctx, 0.1);
  try {
    const r = W * 0.45;
    const ph = t * 0.2;
    const x1 = W / 2 + Math.sin(ph) * W * 0.15;
    const y1 = H * 0.3 + Math.cos(ph) * H * 0.05;
    const x2 = W / 2 + Math.cos(ph) * W * 0.15;
    const y2 = H * 0.7 + Math.sin(ph) * H * 0.05;
    const spots: Array<[number, number]> = [
      [x1, y1],
      [x2, y2],
    ];
    for (const [x, y] of spots) {
      try {
        ctx.beginPath!();
        ctx.arc!(x, y, r, 0, Math.PI * 2);
        ctx.fill!();
      } catch {
        // Skip blob, never throw.
      }
    }
  } finally {
    resetSceneAlpha(ctx);
  }
}

function paintGrid(ctx: DrawCtx, t: number, W: number, H: number, accent: string): void {
  if (typeof ctx.fillRect !== "function") return;
  setSceneFill(ctx, accent);
  setSceneAlpha(ctx, 0.07);
  try {
    for (let x = 0; x <= W; x += 64) {
      try {
        ctx.fillRect(x, 0, 2, H);
      } catch {
        // Skip line, never throw.
      }
    }
    for (let y = 0; y <= H; y += 64) {
      try {
        ctx.fillRect(0, y, W, 2);
      } catch {
        // Skip line, never throw.
      }
    }
    const sx = ((t * 40) % (W + 200)) - 100;
    setSceneAlpha(ctx, 0.25);
    setSceneFill(ctx, accent);
    try {
      ctx.fillRect(sx, 0, 3, H);
    } catch {
      // Skip highlight, never throw.
    }
  } finally {
    resetSceneAlpha(ctx);
  }
}

function paintWaves(ctx: DrawCtx, t: number, W: number, H: number, accent: string): void {
  try {
    for (let i = 0; i < 3; i++) {
      if (
        typeof ctx.beginPath !== "function" ||
        typeof ctx.fill !== "function" ||
        typeof ctx.fillRect !== "function"
      ) {
        continue;
      }
      const baseY = H * (0.3 + 0.2 * i);
      const phase = t * 0.8 + i;
      setSceneFill(ctx, accent);
      setSceneAlpha(ctx, 0.08);
      try {
        ctx.beginPath!();
        for (let x = 0; x < W; x += 16) {
          const y = baseY + Math.sin(x * 0.02 + phase) * 30;
          try {
            ctx.fillRect(x, y, 16, 4);
          } catch {
            // Skip strip, never throw.
          }
        }
        try {
          ctx.fill!();
        } catch {
          // Skip fill, never throw.
        }
      } catch {
        // Skip band, never throw.
      } finally {
        resetSceneAlpha(ctx);
      }
    }
  } catch {
    // Waves must never throw.
  } finally {
    resetSceneAlpha(ctx);
  }
}

function paintPulse(ctx: DrawCtx, t: number, W: number, H: number, accent: string): void {
  if (typeof ctx.beginPath !== "function" || typeof ctx.arc !== "function" || typeof ctx.fill !== "function") return;
  const r = (t * 60) % 400;
  if (!(r > 0.5)) {
    return;
  }
  const alpha = 0.15 * (1 - r / 400);
  setSceneFill(ctx, accent);
  setSceneAlpha(ctx, alpha);
  try {
    try {
      ctx.beginPath!();
      ctx.arc!(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.fill!();
    } catch {
      // Skip ring, never throw.
    }
  } finally {
    resetSceneAlpha(ctx);
  }
}

export function drawScene(
  ctx: DrawCtx,
  variant: SceneVariant,
  t: number,
  W: number,
  H: number,
  accent: string,
): void {
  try {
    switch (variant) {
      case "rays":
        paintRays(ctx, t, W, H, accent);
        break;
      case "blobs":
        paintBlobs(ctx, t, W, H, accent);
        break;
      case "grid":
        paintGrid(ctx, t, W, H, accent);
        break;
      case "waves":
        paintWaves(ctx, t, W, H, accent);
        break;
      case "pulse":
        paintPulse(ctx, t, W, H, accent);
        break;
    }
  } catch {
    // Scene must never throw.
    try {
      resetSceneAlpha(ctx);
    } catch {
      // Ignore.
    }
  }
}

export function drawFrame(
  ctx: DrawCtx,
  frame: PlannedFrame,
  theme: Theme,
  W = 720,
  H = 1280,
  extra?: RenderExtra,
  totalSecs: number = VIDEO_SECS,
): void {
  // Opt-in credit card: the whole frame, no captions, no b-roll, no motion.
  if (extra?.endCard) {
    try {
      drawEndCard(ctx, W, H, theme.accent);
    } catch {
      // The card must never throw; worst case the frame stays blank.
    }
    return;
  }
  const visualEffect = extra?.visualEffect ?? "none";
  if (visualEffect !== "none") ctx.filter = visualEffectFilters[visualEffect];
  const footage = extra?.asset?.kind === "video";
  const bg0 = typeof theme.bg[0] === "string" && theme.bg[0].length > 0 ? theme.bg[0] : "";
  const bg1 = typeof theme.bg[1] === "string" && theme.bg[1].length > 0 ? theme.bg[1] : "";
  const hasBg = bg0 !== "" && bg1 !== "";
  const g = hasBg ? ctx.createLinearGradient?.(0, 0, 0, H) : undefined;
  const paintBg = () => {
    if (g) {
      const gl = g as unknown as GradientLike;
      gl.addColorStop(0, bg0);
      gl.addColorStop(1, bg1);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = hasBg ? bg0 : "#080A0D";
    }
    ctx.fillRect(0, 0, W, H);
  };
  const hasTransform =
    typeof ctx.save === "function" &&
    typeof ctx.restore === "function" &&
    typeof ctx.translate === "function" &&
    typeof ctx.scale === "function";
  let painted = false;
  let brollDrawn = false;
  const skipScene = !!extra?.asset;
  const sceneVariant: SceneVariant = frame.variant ?? variantForKind(frame.cue.kind);
  const paintScene = () => {
    if (skipScene) return;
    try {
      drawScene(ctx, sceneVariant, frame.t, W, H, theme.accent);
    } catch {
      // Scene must never throw; bg already painted.
    }
  };
  const paintBroll = () => {
    const asset = extra?.asset;
    if (asset) {
      const { w: iw, h: ih } = assetSize(asset.el);
      if (iw > 0 && ih > 0 && typeof ctx.drawImage === "function") {
        const s = Math.max(W / iw, H / ih);
        const dw = iw * s;
        const dh = ih * s;
        const dx = (W - dw) / 2;
        const dy = (H - dh) / 2;
        try {
          // Same cover-fit for image bitmaps and video frames.
          ctx.drawImage(asset.el as BrollImage, dx, dy, dw, dh);
          brollDrawn = true;
        } catch {
          // drawImage on a not-ready <video> throws — gradient fallback.
        }
      }
    }
  };
  if (hasTransform) {
    const z = footage ? 1 : 1 + 0.08 * (frame.t / totalSecs);
    let entered = false;
    try {
      ctx.save!();
      entered = true;
      ctx.translate!(W / 2, H / 2);
      ctx.scale!(z, z);
      ctx.translate!(-W / 2, -H / 2);
      paintBg();
      painted = true;
      try {
        paintScene();
      } catch {
        // Scene inside zoom must never throw; bg already painted.
      }
      try {
        paintBroll();
      } catch {
        // B-roll inside zoom must never throw; bg already painted.
      }
      entered = false;
      ctx.restore!();
    } catch {
      if (entered) {
        try {
          ctx.restore!();
        } catch {
          // No-throw zoom skip.
        }
      }
    }
  }
  if (!painted) {
    try {
      paintBg();
    } catch {
      // Plain draw must never throw.
    }
    try {
      paintScene();
    } catch {
      // Scene fallback must never throw.
    }
  }
  if (!brollDrawn) {
    try {
      paintBroll();
    } catch {
      // Gradient path fallback: bg already drawn, no throw.
    }
  }
  if (brollDrawn) {
    try {
      try {
        ctx.globalAlpha = footage ? 0.16 : 0.55;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, W, H);
      } finally {
        try {
          ctx.globalAlpha = 1;
        } catch {
          // Never throw while restoring alpha.
        }
      }
    } catch {
      // Overlay must never throw; alpha already restored by finally.
    }
  }
  const fallbackProgress = Math.max(0, Math.min(1, (frame.t - frame.cue.start) / Math.max(0.001, frame.cue.end - frame.cue.start)));
  drawMotionGraphic(
    ctx,
    frame.motionIntent ?? resolveMotionIntent({ cue: frame.cue, cueIndex: 1, approvedProof: false, context: { medium: extra?.asset?.kind, assetKeywords: extra?.asset?.keywords } }),
    frame.progress ?? fallbackProgress,
    W,
    H,
    theme.accent,
    frame.motionLabels,
    footage,
  );
  // Edge dip: brief dip-to-brand-dark across cue boundaries hides hard cuts
  // (including same-take restarts) while the accent bar, progress bar and
  // captions paint after it at full brightness.
  try {
    const DIP_SECS = 0.15;
    const edge = Math.min(frame.t - frame.cue.start, frame.cue.end - frame.t);
    if (edge < DIP_SECS && edge >= 0 && typeof ctx.fillRect === "function") {
      const k = 1 - edge / DIP_SECS;
      try {
        ctx.globalAlpha = 0.7 * k * k;
      } catch {
        // Keep current alpha; the dip darkens slightly less.
      }
      ctx.fillStyle = "#080A0D";
      ctx.fillRect(0, 0, W, H);
      try {
        ctx.globalAlpha = 1;
      } catch {
        // Never throw while restoring alpha.
      }
    }
  } catch {
    // Dip must never throw; captions paint next regardless.
  }
  if (visualEffect !== "none") {
    ctx.filter = "none";
    if (visualEffect === "cinematic" || visualEffect === "mono") {
      const previousAlpha = ctx.globalAlpha ?? 1;
      try {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = visualEffect === "cinematic" ? "#17212a" : "#111111";
        ctx.fillRect(0, 0, W, H);
      } finally { ctx.globalAlpha = previousAlpha; }
    }
    if (visualEffect === "analog") {
      const previousAlpha = ctx.globalAlpha ?? 1;
      try {
        ctx.globalAlpha = 0.11;
        ctx.fillStyle = "#050705";
        const offset = Math.floor(frame.t * 24) % 7;
        for (let y = offset; y < H; y += 7) ctx.fillRect(0, y, W, 2);
        const vignette = ctx.createRadialGradient?.(W / 2, H / 2, W * 0.15, W / 2, H / 2, H * 0.75);
        if (vignette) {
          vignette.addColorStop(0, "#00000000");
          vignette.addColorStop(1, "#000000aa");
          ctx.globalAlpha = 0.38;
          ctx.fillStyle = vignette;
          ctx.fillRect(0, 0, W, H);
        }
      } finally { ctx.globalAlpha = previousAlpha; }
    }
  }
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, W, 12);
  const maxW = W - 96;
  // No-captions fallback position: centered for procedural backgrounds,
  // safe-zone anchored over real footage (faces/UI live at the edges).
  const captionY = footage ? H * (extra?.captionAnchor ?? CAPTION_ANCHOR_RATIO) : H / 2;
  // Headroom for the 1.15x pop word: fit lines against maxW/1.15 so the
  // popped word can never overflow the frame.
  const fitW = maxW / 1.15;
  const base = parseBaseSize(theme.font);
  let lines: string[];
  let best = base;
  // Text measurement helpers — only defined when the ctx supports it.
  let measureAt: ((size: number) => (s: string) => number) | undefined;
  let fitLargest: ((text: string, hi: number) => { size: number; fitted: string[] }) | undefined;
  if (typeof ctx.measureText === "function") {
    const measure = ctx.measureText;
    measureAt = (size: number) => {
      ctx.font = fontFor(theme.font, size);
      const m = measure;
      return (s: string) => m.call(ctx, s).width;
    };
    // Largest size in [28, hi] where every wrapped line of text fits fitW.
    const measureFn = measureAt;
    fitLargest = (text: string, hi: number): { size: number; fitted: string[] } => {
      let lo = 28;
      let top = hi;
      let size = 28;
      while (lo <= top) {
        const mid = Math.floor((lo + top) / 2);
        const candidate = wrapMeasured(text, fitW, measureFn(mid));
        const ok = candidate.every((ln) => measureFn(mid)(ln) <= fitW);
        if (ok) {
          size = mid;
          lo = mid + 1;
        } else {
          top = mid - 1;
        }
      }
      return { size, fitted: wrapMeasured(text, fitW, measureFn(size)) };
    };
  }
  if (!fitLargest) {
    ctx.font = theme.font;
    lines = words(frame.cue.text);
  } else {
    const full = fitLargest(frame.cue.text, base);
    best = full.size;
    ctx.font = fontFor(theme.font, best);
    lines = full.fitted;
  }
  const captionPlan = extra?.captions ?? (extra?.words ? speechPhrases(extra.words) : null);
  if (captionPlan !== null) {
    const phrase = captionPlan.find(item => frame.t >= item.start && frame.t < item.end);
    if (phrase) {
      const activeWord = phrase.kind === "speech" && extra?.words ? findActiveWord(extra.words, frame.t) : undefined;
      drawPhraseCaption(ctx, phrase, frame.t, W, H, theme.accent, activeWord, extra?.captionAnchor);
    }
  } else {
    ctx.fillStyle = "#F7F8FA";
    lines.forEach((line, index) => ctx.fillText(line, 48, captionY + index * 110));
  }
  // Hook card: the clip's promise, held over the opening seconds so muted
  // autoplay reads it before any audio registers. Top band, gone by 4s.
  if (frame.cue.kind === "hook") {
    const elapsed = frame.t - frame.cue.start;
    if (elapsed >= 0 && elapsed < HOOK_CARD_SECS) {
      const headline = hookHeadline(frame.cue.text);
      if (headline) {
        try {
          drawHookCard(ctx, headline, elapsed, W, H, theme.accent);
        } catch {
          // Hook card is garnish; captions already painted.
        }
      }
    }
  }
  // No cue pills: TikTok style shows speech captions only, never
  // HOOK/BEAT/CTA labels.
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, H - 14, (W * frame.t) / totalSecs, 14);
}
