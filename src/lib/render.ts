import type { Theme } from "./packs";
import type { PlannedFrame } from "./planner";

export interface DrawCtx {
  fillStyle: string | CanvasGradient;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
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
  ctx.fillStyle = "#F7F8FA";
  ctx.font = theme.font;
  const lines = words(frame.cue.text);
  lines.forEach((ln, i) => ctx.fillText(ln, 48, H / 2 + i * 110, W - 96));
  ctx.fillStyle = theme.accent;
  ctx.fillRect(48, 88, 200, 56);
  ctx.fillStyle = "#F7F8FA";
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillText(frame.cue.kind.toUpperCase(), 48, 120);
}
