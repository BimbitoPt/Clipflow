import type { TimedCue, VideoScript } from "./script";

export interface PlannedFrame { t: number; cue: TimedCue; }

export function planFrames(script: VideoScript, fps: 30 | 60 = 30): PlannedFrame[] {
  const total = 45;
  const n = total * fps;
  const out: PlannedFrame[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const cue = script.cues.find((c) => t >= c.start && t < c.end) ?? script.cues[script.cues.length - 1]!;
    out.push({ t, cue });
  }
  return out;
}
