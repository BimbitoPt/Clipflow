import type { DrawCtx } from "./render";
import type { MotionIntent } from "./motion-intent";

function alpha(ctx: DrawCtx, value: number, draw: () => void) {
  const previous = ctx.globalAlpha;
  try {
    ctx.globalAlpha = Math.max(0, Math.min(1, value));
    draw();
  } finally {
    ctx.globalAlpha = previous ?? 1;
  }
}

function rect(ctx: DrawCtx, x: number, y: number, width: number, height: number, color: string, opacity = 1) {
  if (width <= 0 || height <= 0) return;
  alpha(ctx, opacity, () => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  });
}

function dot(ctx: DrawCtx, x: number, y: number, radius: number, color: string, opacity = 1) {
  if (!ctx.beginPath || !ctx.arc || !ctx.fill) return;
  alpha(ctx, opacity, () => {
    ctx.fillStyle = color;
    ctx.beginPath!();
    ctx.arc!(x, y, radius, 0, Math.PI * 2);
    ctx.fill!();
  });
}

function text(ctx: DrawCtx, value: string | undefined, x: number, y: number, width: number, color: string, scale: number) {
  if (!value) return;
  ctx.font = `800 ${Math.max(8, Math.round(17 * scale))}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(value.toUpperCase().slice(0, 18), x, y, width);
}

function panel(ctx: DrawCtx, x: number, y: number, width: number, height: number, accent: string, amount: number) {
  rect(ctx, x, y, width, height, "#0b100d", 0.88);
  rect(ctx, x, y, width, 2, accent, 0.28 + amount * 0.72);
  rect(ctx, x, y + height - 2, width, 2, accent, 0.28 + amount * 0.72);
  rect(ctx, x, y, 2, height, accent, 0.28 + amount * 0.72);
  rect(ctx, x + width - 2, y, 2, height, accent, 0.28 + amount * 0.72);
  const inset = Math.max(5, width * 0.12);
  rect(ctx, x + inset, y + height * 0.32, width * 0.58, Math.max(2, height * 0.07), "#f1f4ed", 0.74);
  rect(ctx, x + inset, y + height * 0.52, width * (0.35 + amount * 0.25), Math.max(2, height * 0.045), accent, 0.9);
  rect(ctx, x + inset, y + height * 0.68, width * 0.43, Math.max(2, height * 0.04), "#9ba79a", 0.55);
}

function transform(ctx: DrawCtx, p: number, W: number, H: number, accent: string, labels: string[]) {
  const left = W * 0.1;
  const top = H * 0.27;
  const cardW = W * 0.22;
  const cardH = H * 0.085;
  const centers = [left + cardW / 2, W * 0.5, W * 0.9 - cardW / 2];
  rect(ctx, centers[0]!, top + cardH / 2 - 1, centers[2]! - centers[0]!, 2, "#dfe8d8", 0.22);
  rect(ctx, centers[0]!, top + cardH / 2 - 2, (centers[2]! - centers[0]!) * p, 4, accent, 0.86);
  const phase = Math.min(1, p * 2.8);
  panel(ctx, left, top, cardW, cardH, accent, 1 - Math.min(1, p * 1.4));
  panel(ctx, W * 0.39, top, cardW, cardH, accent, phase);
  panel(ctx, W * 0.68, top, cardW, cardH, accent, Math.max(0, (p - 0.48) * 1.9));
  const labelY = top + cardH + H * 0.03;
  text(ctx, labels[0] ?? "INPUT", left, labelY, cardW, "#f1f4ed", W / 720);
  text(ctx, labels[1] ?? "PROCESS", W * 0.39, labelY, cardW, accent, W / 720);
  text(ctx, labels[2] ?? labels[1] ?? "RESULT", W * 0.68, labelY, cardW, "#f1f4ed", W / 720);
  const travel = centers[0]! + (centers[2]! - centers[0]!) * p;
  dot(ctx, travel, top + cardH / 2, Math.max(3, W * 0.012), accent, 0.9);
}

function sequence(ctx: DrawCtx, p: number, W: number, H: number, accent: string, labels: string[]) {
  const count = labels.length >= 2 ? Math.min(4, labels.length) : 4;
  const left = W * 0.17;
  const right = W * 0.83;
  const y = H * 0.31;
  const gap = (right - left) / (count - 1);
  const active = Math.min(count - 1, Math.floor(p * count));
  rect(ctx, left, y - 1, right - left, 2, "#eff4e8", 0.25);
  rect(ctx, left, y - 2, Math.max(0, (right - left) * p), 4, accent, 0.92);
  for (let i = 0; i < count; i++) {
    const isActive = i <= active;
    dot(ctx, left + gap * i, y, W * (isActive ? 0.026 : 0.021), isActive ? accent : "#354232", isActive ? 1 : 0.9);
    if (isActive) dot(ctx, left + gap * i, y, W * 0.009, "#11170d", 0.95);
    text(ctx, labels[i] ?? `STEP ${i + 1}`, left + gap * i - W * 0.07, y + H * 0.055, W * 0.14, isActive ? "#f1f4ed" : "#9ba79a", W / 720);
  }
  const markerX = left + (right - left) * p;
  dot(ctx, markerX, y, W * 0.04, accent, 0.13);
}

function comparison(ctx: DrawCtx, p: number, W: number, H: number, accent: string, labels: string[]) {
  const top = H * 0.27;
  const panelW = W * 0.29;
  const panelH = H * 0.1;
  const leftX = W * 0.1;
  const rightX = W * 0.61;
  panel(ctx, leftX, top, panelW, panelH, "#c2cabb", 0.3);
  panel(ctx, rightX, top, panelW, panelH, accent, 0.35 + p * 0.65);
  text(ctx, labels[0] ?? "START", leftX, top + panelH + H * 0.03, panelW, "#f1f4ed", W / 720);
  text(ctx, labels[1] ?? labels[0] ?? "SHIFT", rightX, top + panelH + H * 0.03, panelW, accent, W / 720);
  const center = W * 0.5;
  rect(ctx, center - 1, top + 4, 2, panelH - 8, "#e6eddf", 0.3);
  rect(ctx, center - 1, top + 4, 2, (panelH - 8) * p, accent, 0.9);
  const tickX = center + (p - 0.5) * W * 0.12;
  rect(ctx, tickX - 2, top + panelH * 0.2, 4, panelH * 0.6, accent, 0.95);
}

function evidenceReveal(ctx: DrawCtx, p: number, W: number, H: number, accent: string, labels: string[]) {
  const left = W * 0.09;
  const right = W * 0.91;
  const top = H * 0.205;
  const bottom = H * 0.405;
  const corner = W * 0.11;
  const thickness = Math.max(2, W * 0.007);
  for (const x of [left, right - corner]) {
    rect(ctx, x, top, corner, thickness, accent, 0.92);
    rect(ctx, x, bottom - thickness, corner, thickness, accent, 0.82);
  }
  for (const x of [left, right - thickness]) {
    rect(ctx, x, top, thickness, corner * 0.7, accent, 0.82);
    rect(ctx, x, bottom - corner * 0.7, thickness, corner * 0.7, accent, 0.82);
  }
  const scanY = top + (bottom - top) * p;
  rect(ctx, left + thickness, scanY, right - left - thickness * 2, thickness, accent, 0.7);
  dot(ctx, left + (right - left) * p, scanY, Math.max(3, W * 0.012), accent, 0.95);
  text(ctx, labels.join(" · ") || "APPROVED EVIDENCE", left + thickness * 2, bottom + H * 0.025, right - left, "#f1f4ed", W / 720);
}

function payoff(ctx: DrawCtx, p: number, W: number, H: number, accent: string, labels: string[]) {
  const cx = W / 2;
  const cy = H * 0.31;
  const radius = W * 0.2;
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
    const x = cx + Math.cos(angle) * radius * (1 - p * 0.58);
    const y = cy + Math.sin(angle) * radius * (1 - p * 0.58);
    rect(ctx, x - W * 0.012, y - W * 0.012, W * 0.024, W * 0.024, accent, 0.32 + p * 0.68);
  }
  const size = W * (0.04 + p * 0.045);
  rect(ctx, cx - size, cy - size, size * 2, size * 2, accent, 0.18 + p * 0.48);
  rect(ctx, cx - size * 0.5, cy - size * 0.5, size, size, "#11170d", p * 0.85);
  text(ctx, labels[0] ?? "NEXT", cx - W * 0.2, cy + H * 0.12, W * 0.4, "#f1f4ed", W / 720);
}

export function drawMotionGraphic(ctx: DrawCtx, intent: MotionIntent, progress: number, width: number, height: number, accent: string, labels: string[] = [], footage = false): void {
  const p = Math.max(0, Math.min(1, progress));
  try {
    switch (intent) {
      case "none": return;
      case "kinetic-type":
        // Typography is the subject; a short underline enters, holds, and exits.
        rect(ctx, width * 0.07, height * (footage ? 0.84 : 0.60), width * 0.23 * Math.min(1, p * 7), Math.max(2, width * 0.006), accent, Math.min(1, (1 - p) * 8));
        break;
      case "focus":
        // Edge accents leave the center clear rather than pretending to track an object.
        rect(ctx, width * 0.045, height * 0.21, Math.max(2, width * 0.005), height * 0.055, accent, Math.sin(p * Math.PI) * 0.7);
        rect(ctx, width * 0.95, height * 0.62, Math.max(2, width * 0.005), height * 0.055, accent, Math.sin(p * Math.PI) * 0.7);
        break;
      case "metric":
        alpha(ctx, Math.min(1, p * 6), () => {
          ctx.font = `800 ${Math.round(width * 0.14)}px system-ui, sans-serif`;
          ctx.fillStyle = accent;
          ctx.fillText(labels[0] ?? "", width * 0.1, height * 0.35, width * 0.8);
        });
        rect(ctx, width * 0.1, height * 0.38, width * 0.8 * Math.min(1, p * 3), Math.max(2, width * 0.005), accent, 0.6);
        break;
      case "transform": transform(ctx, p, width, height, accent, labels); break;
      case "sequence": sequence(ctx, p, width, height, accent, labels); break;
      case "comparison": comparison(ctx, p, width, height, accent, labels); break;
      case "evidence-reveal": evidenceReveal(ctx, p, width, height, accent, labels); break;
      case "payoff": payoff(ctx, p, width, height, accent, labels); break;
    }
  } catch {
    if (ctx.globalAlpha !== undefined) ctx.globalAlpha = 1;
  }
}
