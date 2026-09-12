import { drawFrame, type DrawCtx } from "./render";
import type { Theme } from "./packs";
import type { PlannedFrame } from "./planner";

export interface FrameEncoder {
  encode(frame: { t: number; draw: (ctx: DrawCtx) => void }): void;
  finalize(): Promise<Uint8Array>;
}

export interface ExportOpts {
  frames: PlannedFrame[];
  theme: Theme;
  fps: 30 | 60;
  W?: number;
  H?: number;
  encoderFactory?: () => FrameEncoder;
}

export async function exportClip(opts: ExportOpts): Promise<Uint8Array> {
  const factory = opts.encoderFactory;
  if (!factory) {
    throw new Error("E_NO_WEBCODECS: this browser has no hardware encoder — try Chrome or Edge.");
  }
  const enc = factory();
  for (const f of opts.frames) {
    enc.encode({ t: f.t, draw: (ctx) => drawFrame(ctx, f, opts.theme, opts.W ?? 720, opts.H ?? 1280) });
  }
  return enc.finalize();
}
