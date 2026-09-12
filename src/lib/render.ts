import type { Theme } from "./packs";
import { VIDEO_SECS, type PlannedFrame } from "./planner";

export interface DrawCtx {
  fillStyle: string | CanvasGradient;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText?(text: string): { width: number };
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
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

export function drawFrame(ctx: DrawCtx, frame: PlannedFrame, theme: Theme, W = 720, H = 1280): void {
  const bg0 = typeof theme.bg[0] === "string" && theme.bg[0].length > 0 ? theme.bg[0] : "";
  const bg1 = typeof theme.bg[1] === "string" && theme.bg[1].length > 0 ? theme.bg[1] : "";
  const hasBg = bg0 !== "" && bg1 !== "";
  const g = hasBg ? ctx.createLinearGradient?.(0, 0, 0, H) : undefined;
  if (g) {
    const gl = g as unknown as GradientLike;
    gl.addColorStop(0, bg0);
    gl.addColorStop(1, bg1);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = hasBg ? bg0 : "#080A0D";
  }
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, W, 12);
  const maxW = W - 96;
  const base = parseBaseSize(theme.font);
  let lines: string[];
  if (typeof ctx.measureText !== "function") {
    ctx.font = theme.font;
    lines = words(frame.cue.text);
  } else {
    const measureAt = (size: number) => {
      ctx.font = fontFor(theme.font, size);
      const m = ctx.measureText!;
      return (s: string) => m.call(ctx, s).width;
    };
    let lo = 28;
    let hi = base;
    let best = 28;
    // Binary-search largest size in [28, base] where every wrapped line fits.
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const candidate = wrapMeasured(frame.cue.text, maxW, measureAt(mid));
      const ok = candidate.every((ln) => measureAt(mid)(ln) <= maxW);
      if (ok) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    ctx.font = fontFor(theme.font, best);
    const measureBest = measureAt(best);
    lines = wrapMeasured(frame.cue.text, maxW, measureBest);
  }
  ctx.fillStyle = "#F7F8FA";
  lines.forEach((ln, i) => ctx.fillText(ln, 48, H / 2 + i * 110));
  const label = frame.cue.kind.toUpperCase();
  const pillFont = "700 40px system-ui, sans-serif";
  ctx.font = pillFont;
  let pillW = 200;
  if (typeof ctx.measureText === "function") {
    const lw = ctx.measureText.call(ctx, label).width;
    pillW = Math.max(120, lw + 48);
  }
  ctx.fillStyle = theme.accent;
  ctx.fillRect(48, 88, pillW, 56);
  ctx.fillStyle = "#F7F8FA";
  ctx.font = pillFont;
  ctx.fillText(label, 72, 126);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, H - 14, (W * frame.t) / VIDEO_SECS, 14);
}
