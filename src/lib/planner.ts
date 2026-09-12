import type { TimedCue, VideoScript } from "./script";

export interface PlannedFrame { t: number; cue: TimedCue; }

export const VIDEO_SECS = 45;

export function planFrames(script: VideoScript, fps: 30 | 60 = 30): PlannedFrame[] {
  const total = VIDEO_SECS;
  const n = total * fps;
  const out: PlannedFrame[] = [];
  const sb = (c: { start: number; end: number }) => [Math.round(c.start * fps), Math.round(c.end * fps)] as const;
  let prev = script.cues[0]!;
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const fi = i;
    const found = script.cues.find((c) => {
      const [sb0, sb1] = sb(c);
      return fi >= sb0 && fi < sb1;
    });
    const cue = found ?? prev;
    prev = cue;
    out.push({ t, cue });
  }
  return out;
}
