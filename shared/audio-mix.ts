/**
 * Canonical audio policy for Clipflow. Preview (Remotion), ffmpeg export
 * scripts, the inspect harness, and the future native renderer all read the
 * same numbers so what you hear in the studio is what the export ships.
 */

/** Per-cue Kokoro voiceover shaping. */
export const VOICE = {
  kokoroVoice: "af_heart",
  /** Leave this much of each cue window unfilled so cues breathe. */
  windowHeadroomSec: 0.4,
  /** Encode target peak for 16-bit PCM WAV (prevents clipping after mix). */
  peakTarget: 0.89,
  maxGain: 8,
} as const;

export interface CueFit {
  fitSecs: number;
  /** atempo multiplier; >1 only when the spoken audio overruns its window. */
  tempo: number;
}

/** Squeeze overrunning voice into its cue window; leave headroom otherwise. */
export function cueFit(spokenSecs: number, windowSecs: number): CueFit {
  const room = windowSecs - VOICE.windowHeadroomSec;
  if (room <= 0) return { fitSecs: Math.max(0, spokenSecs), tempo: 1 };
  const fitSecs = Math.min(room, spokenSecs);
  const tempo = spokenSecs > room ? spokenSecs / fitSecs : 1;
  return { fitSecs, tempo };
}

/** Gain that brings a PCM peak to VOICE.peakTarget, capped against blowups. */
export function peakGain(peak: number): number {
  return peak > 0.001 ? Math.min(VOICE.maxGain, VOICE.peakTarget / peak) : 1;
}

/**
 * ffmpeg filter placing one voice input at its cue start.
 * `inputIndex` is the 0-based `-i` position of that WAV in the command.
 */
export function voicePlacement(inputIndex: number, startSec: number, tempo: number, label: string): string {
  const chain = tempo > 1 ? `atempo=${tempo.toFixed(4)},` : "";
  return `[${inputIndex}:a]${chain}adelay=${Math.round(startSec * 1000)}:all=1[${label}]`;
}

/** amix (no normalization) + apad to the full timeline, labels [a0..aN-1]. */
export function voiceMixTail(count: number, totalSecs: number, outLabel = "a"): string {
  if (count <= 0) return `anullsrc=r=44100:cl=stereo,apad=whole_dur=${totalSecs}[${outLabel}]`;
  const labels = Array.from({ length: count }, (_, i) => `[a${i}]`).join("");
  return `${labels}amix=inputs=${count}:duration=longest:normalize=0[mix];[mix]apad=whole_dur=${totalSecs}[${outLabel}]`;
}

/** Music-bed ducking around voice windows (Remotion preview + future export). */
export interface DuckPolicy {
  speaking: number;
  idle: number;
  /** Open the speaking window this many seconds before each word (and close this long after). */
  leadSec: number;
}

export const DUCK = {
  standard: { speaking: 0.055, idle: 0.18, leadSec: 0.15 },
  creative: { speaking: 0.12, idle: 0.26, leadSec: 0.15 },
} as const;

export interface TimeWindow {
  start: number;
  end: number;
}

/** Music volume at time `t`: ducked while any voice window (±lead) is active. */
export function musicVolumeAt(
  t: number,
  voiceWindows: readonly TimeWindow[],
  creative: boolean,
  policy: DuckPolicy = creative ? DUCK.creative : DUCK.standard,
): number {
  const speaking = voiceWindows.some((w) => t >= w.start - policy.leadSec && t < w.end + policy.leadSec);
  return speaking ? policy.speaking : policy.idle;
}

/** Fixed SFX and voice gains used by the Remotion soundtrack. */
export const SFX = {
  voiceGain: 1,
  featured: 0.42,
  sceneWhoosh: 0.32,
  stepPop: 0.3,
} as const;

/** Shared loudness target for produced voice tracks. */
export const LOUDNORM = "I=-14:TP=-1.5:LRA=11";

/** Ambient bed filter chain (octane-style processed room tone). */
export const AMBIENT = { volume: 0.13, highpass: 90, lowpass: 900 } as const;

export function ambientChain(a: { volume: number; highpass: number; lowpass: number } = AMBIENT): string {
  return `volume=${a.volume},highpass=f=${a.highpass},lowpass=f=${a.lowpass}`;
}

/** Music bed gains with short fades (octane-style). */
export const MUSIC_BED = { volume: 0.92, fadeInSec: 0.04, fadeOutSec: 0.35 } as const;

export function musicBedChain(totalSecs: number, m: { volume: number; fadeInSec: number; fadeOutSec: number } = MUSIC_BED): string {
  const outStart = Math.max(0, totalSecs - m.fadeOutSec).toFixed(3);
  return `volume=${m.volume},afade=t=in:st=0:d=${m.fadeInSec},afade=t=out:st=${outStart}:d=${m.fadeOutSec}`;
}

/** Final mix limiter ceiling. */
export const MIX_LIMIT = 0.94;

export function limiterChain(limit: number = MIX_LIMIT): string {
  return `alimiter=limit=${limit}`;
}
