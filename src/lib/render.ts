import type { Theme } from "./packs";
import type { PlannedFrame } from "./planner";

export interface DrawCtx {
  fillStyle: string | CanvasGradient;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
}

function words(text: string, max = 8): string[] {
  const ws = text.split(" ");
  const lines: string[] = [];
  for (let i = 0; i < ws.length; i += max) lines.push(ws.slice(i, i + max).join(" "));
  return lines.slice(0, 4);
}

export function drawFrame(ctx: DrawCtx, frame: PlannedFrame, theme: Theme, W = 720, H = 1280): void {
  const g = ctx.createLinearGradient?.(0, 0, 0, H);
  if (g) {
    (g as unknown as { addColorStop(o: number, c: string): void }).addColorStop(0, theme.bg[0]);
    (g as unknown as { addColorStop(o: number, c: string): void }).addColorStop(1, theme.bg[1]);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = theme.bg[0];
  }
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, W, 12);
  ctx.fillStyle = "#F7F8FA";
  ctx.font = theme.font;
  const lines = words(frame.cue.text);
  lines.forEach((ln, i) => ctx.fillText(ln, 48, H / 2 + i * 110, W - 96));
  ctx.fillStyle = theme.accent;
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillText(frame.cue.kind.toUpperCase(), 48, 120);
}
