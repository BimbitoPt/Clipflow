import type { Theme } from "./packs";
import { VIDEO_SECS, type PlannedFrame, type SceneVariant, type WordCue } from "./planner";

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
  // Integer px: fractional sizes (e.g. 32.199999999999996px) break naive
  // /(\d+)px/ font-size parsers, which match the trailing digit run.
  const popFont = fontFor(baseFont, Math.max(1, Math.round(baseSize * 1.15)));
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
  let brollDrawn = false;
  const skipScene = !!extra?.image;
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
    if (extra?.image) {
      const iw = extra.image.width;
      const ih = extra.image.height;
      if (iw > 0 && ih > 0 && typeof ctx.drawImage === "function") {
        const s = Math.max(W / iw, H / ih);
        const dw = iw * s;
        const dh = ih * s;
        const dx = (W - dw) / 2;
        const dy = (H - dh) / 2;
        ctx.drawImage(extra.image, dx, dy, dw, dh);
        brollDrawn = true;
      }
    }
  };
  if (hasTransform) {
    const z = 1 + 0.08 * (frame.t / VIDEO_SECS);
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
        ctx.globalAlpha = 0.55;
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
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, W, 12);
  const maxW = W - 96;
  // Headroom for the 1.15x pop word: fit lines against maxW/1.15 so the
  // popped word can never overflow the frame.
  const fitW = maxW / 1.15;
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
      const candidate = wrapMeasured(frame.cue.text, fitW, measureAt(mid));
      const ok = candidate.every((ln) => measureAt(mid)(ln) <= fitW);
      if (ok) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    ctx.font = fontFor(theme.font, best);
    const measureBest = measureAt(best);
    lines = wrapMeasured(frame.cue.text, fitW, measureBest);
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
