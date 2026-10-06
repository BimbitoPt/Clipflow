/**
 * Export worker protocol + capability probes. Muxer-free on purpose: App
 * imports this module, and importing mp4-muxer into the main bundle would
 * defeat the code split the worker exists for.
 */

export const VIDEO_CONFIG = { codec: "avc1.42001f", width: 720, height: 1280, bitrate: 5_000_000, framerate: 30 } as const;
export const AUDIO_CONFIG = { codec: "mpac", sampleRate: 16000, numberOfChannels: 1, bitrate: 96000 } as const;
/** Main thread pauses sending when the worker queue passes this depth. */
export const MAX_QUEUE = 24;
/** …and resumes once it drains to this depth. */
export const RESUME_QUEUE = 8;

export type ToWorker =
  | { type: "init"; voice: boolean }
  | { type: "frame"; frame: VideoFrame; keyFrame: boolean }
  | { type: "audio"; data: AudioData }
  | { type: "finish" }
  | { type: "abort" };

export type FromWorker =
  | { type: "ready" }
  | { type: "accepted"; queue: number }
  | { type: "done"; buffer: ArrayBuffer }
  | { type: "error"; message: string }
  | { type: "aborted" };

export type ProbeResult = { supported: boolean; reason: "missing" | "unsupported" | "error" | null };

/** Does this browser encode our exact shipping video config? Never throws. */
export async function probeVideoConfig(): Promise<ProbeResult> {
  try {
    if (typeof VideoEncoder === "undefined" || typeof VideoEncoder.isConfigSupported !== "function") {
      return { supported: false, reason: "missing" };
    }
    const result = await VideoEncoder.isConfigSupported({ ...VIDEO_CONFIG });
    return result.supported ? { supported: true, reason: null } : { supported: false, reason: "unsupported" };
  } catch {
    return { supported: false, reason: "error" };
  }
}

/** Does this browser encode our exact shipping audio config? Never throws. */
export async function probeAudioConfig(): Promise<ProbeResult> {
  try {
    if (typeof AudioEncoder === "undefined" || typeof AudioEncoder.isConfigSupported !== "function") {
      return { supported: false, reason: "missing" };
    }
    const result = await AudioEncoder.isConfigSupported({ ...AUDIO_CONFIG });
    return result.supported ? { supported: true, reason: null } : { supported: false, reason: "unsupported" };
  } catch {
    return { supported: false, reason: "error" };
  }
}
