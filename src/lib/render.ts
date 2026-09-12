import type { Theme } from "./packs";
import { VIDEO_SECS, type PlannedFrame, type WordCue } from "./planner";

export interface BrollImage {
  width: number;
  height: number;
}

export interface RenderExtra {
  image?: BrollImage;
  words?: WordCue[];
}

export interface DrawCtx {
  fillStyle: string | CanvasGradient;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText?(text: string): { width: number };
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
  save?(): void;
  restore?(): void;
  translate?(x: number, y: number): void;
  scale?(x: number, y: number): void;
  drawImage?(img: BrollImage, dx: number, dy: number, dw: number, dh: number): void;
  globalAlpha?: number;
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

function findCurrentWord(wordList: WordCue[], frame: PlannedFrame): WordCue | undefined {
  const inCue = wordList.filter((w) => w.start >= frame.cue.start && w.start < frame.cue.end);
  if (inCue.length === 0) return undefined;
  const sorted = [...inCue].sort((a, b) => a.start - b.start);
  let cur: WordCue | undefined;
  for (const w of sorted) {
    if (w.start <= frame.t) cur = w;
    else break;
  }
  return cur ?? sorted[0];
}

function drawPopLine(
  ctx: DrawCtx,
  line: string,
  popWord: string,
  x: number,
  y: number,
  baseFont: string,
  baseSize: number,
  accent: string,
): void {
  if (typeof ctx.measureText !== "function") {
    ctx.fillStyle = "#F7F8FA";
    ctx.fillText(line, x, y);
    return;
  }
  const normalFont = fontFor(baseFont, baseSize);
  const popFont = fontFor(baseFont, baseSize * 1.15);
  const tokens = line.split(" ").filter(Boolean);
  const popIdx = tokens.findIndex((t) => t === popWord);
  if (popIdx < 0) {
    ctx.fillStyle = "#F7F8FA";
    ctx.font = normalFont;
    ctx.fillText(line, x, y);
    return;
  }
  ctx.font = normalFont;
  let spaceW = 0;
  try {
    spaceW = ctx.measureText.call(ctx, " ").width;
  } catch {
    spaceW = 0;
  }
  let curX = x;
  tokens.forEach((tok, idx) => {
    const isPop = idx === popIdx;
    try {
      if (isPop) {
        ctx.font = popFont;
        ctx.fillStyle = accent;
        ctx.fillText(tok, curX, y);
        const w = ctx.measureText!.call(ctx, tok).width;
        curX += w + spaceW;
      } else {
        ctx.font = normalFont;
        ctx.fillStyle = "#F7F8FA";
        ctx.fillText(tok, curX, y);
        const w = ctx.measureText!.call(ctx, tok).width;
        curX += w + spaceW;
      }
    } catch {
      // No-throw fallback per word.
    }
  });
}

export function drawFrame(
  ctx: DrawCtx,
  frame: PlannedFrame,
  theme: Theme,
  W = 720,
  H = 1280,
  extra?: RenderExtra,
): void {
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
  if (hasTransform) {
    const z = 1 + 0.08 * (frame.t / VIDEO_SECS);
    try {
      ctx.save!();
      ctx.translate!(W / 2, H / 2);
      ctx.scale!(z, z);
      ctx.translate!(-W / 2, -H / 2);
      paintBg();
      painted = true;
      ctx.restore!();
    } catch {
      try {
        ctx.restore!();
      } catch {
        // No-throw zoom skip.
      }
    }
  }
  if (!painted) {
    try {
      paintBg();
    } catch {
      // Plain draw must never throw.
    }
  }
  if (extra?.image) {
    const iw = extra.image.width;
    const ih = extra.image.height;
    if (iw > 0 && ih > 0 && typeof ctx.drawImage === "function") {
      try {
        const s = Math.max(W / iw, H / ih);
        const dw = iw * s;
        const dh = ih * s;
        const dx = (W - dw) / 2;
        const dy = (H - dh) / 2;
        ctx.drawImage(extra.image, dx, dy, dw, dh);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      } catch {
        // Gradient path fallback: bg already drawn, no throw.
      }
    }
  }
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, W, 12);
  const maxW = W - 96;
  const base = parseBaseSize(theme.font);
  let lines: string[];
  let best = base;
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
    best = 28;
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
  const wordList = extra?.words;
  if (wordList && wordList.length > 0 && typeof ctx.measureText === "function") {
    let current: WordCue | undefined;
    try {
      current = findCurrentWord(wordList, frame);
    } catch {
      current = undefined;
    }
    if (current) {
      const popIdx = lines.findIndex((ln) => ln.split(" ").includes(current!.word));
      if (popIdx >= 0) {
        lines.forEach((ln, i) => {
          const y = H / 2 + i * 110;
          if (i === popIdx) {
            try {
              drawPopLine(ctx, ln, current!.word, 48, y, theme.font, best, theme.accent);
            } catch {
              ctx.fillStyle = "#F7F8FA";
              ctx.font = fontFor(theme.font, best);
              ctx.fillText(ln, 48, y);
            }
          } else {
            ctx.fillStyle = "#F7F8FA";
            ctx.font = fontFor(theme.font, best);
            ctx.fillText(ln, 48, y);
          }
        });
      } else {
        ctx.fillStyle = "#F7F8FA";
        lines.forEach((ln, i) => ctx.fillText(ln, 48, H / 2 + i * 110));
      }
    } else {
      ctx.fillStyle = "#F7F8FA";
      lines.forEach((ln, i) => ctx.fillText(ln, 48, H / 2 + i * 110));
    }
  } else {
    ctx.fillStyle = "#F7F8FA";
    lines.forEach((ln, i) => ctx.fillText(ln, 48, H / 2 + i * 110));
  }
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
