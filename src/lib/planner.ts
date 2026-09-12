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

export interface WordCue {
  word: string;
  start: number;
  end: number;
  cueKind: "hook" | "beat" | "cta";
}

/**
 * Even-split word timing: each cue's [start, end) span is divided evenly
 * across its whitespace-separated tokens, so word windows are float seconds.
 * Consumers must compare with `start <= t < end` plus a last-word-of-cue
 * fallback (same rule as planFrames) — never integer frame indices.
 */
export function planWords(script: VideoScript): WordCue[] {
  const out: WordCue[] = [];
  for (const cue of script.cues) {
    const tokens = cue.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const span = cue.end - cue.start;
    tokens.forEach((word, i) => {
      out.push({
        word,
        start: cue.start + (span * i) / tokens.length,
        end: cue.start + (span * (i + 1)) / tokens.length,
        cueKind: cue.kind,
      });
    });
  }
  return out;
}
