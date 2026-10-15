/**
 * Export worker protocol + capability probes. Muxer-free on purpose: App
 * imports this module, and importing mp4-muxer into the main bundle would
 * defeat the code split the worker exists for.
 */

export const VIDEO_CONFIG = { codec: "avc1.42001f", width: 720, height: 1280, bitrate: 5_000_000, framerate: 30 } as const;
export const AUDIO_CONFIG = { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 1, bitrate: 96000 } as const;
/** Firefox fallback: no AAC encoder, but Opus encodes fine. mp4-muxer muxes it. */
export const OPUS_AUDIO_CONFIG = { codec: "opus", sampleRate: 48000, numberOfChannels: 1, bitrate: 96000 } as const;
/** Last-resort recorder mimes, best first (Safari MP4, then Firefox WebM). */
export const MEDIA_RECORDER_MIMES = ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"] as const;

export type AudioCodec = "aac" | "opus";
/** Main thread pauses sending when the worker queue passes this depth. */
export const MAX_QUEUE = 24;
/** …and resumes once it drains to this depth. */
export const RESUME_QUEUE = 8;

export type ToWorker =
  | { type: "init"; voice: boolean; audioCodec?: AudioCodec }
  | { type: "frame"; frame: VideoFrame; keyFrame: boolean }
  | { type: "audio"; data: AudioData }
  | { type: "finish" }
  | { type: "abort" };

export type FromWorker =
  | { type: "ready" }
  | { type: "accepted"; queue: number }
  | { type: "stage"; stage: "flushing-video" | "flushing-audio" | "finalizing" }
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

export interface VoiceEncoderProbe {
  supported: boolean;
  /** AAC preferred (Chrome/Edge/Safari), Opus fallback (Firefox). Null when neither. */
  codec: AudioCodec | null;
  reason: "missing" | "unsupported" | "error" | null;
}

/** Probe AAC first, then Opus — voice works wherever either encodes. Never throws. */
export async function probeVoiceEncoder(): Promise<VoiceEncoderProbe> {
  try {
    if (
      typeof AudioEncoder === "undefined" ||
      typeof AudioEncoder.isConfigSupported !== "function" ||
      typeof AudioData === "undefined"
    ) {
      return { supported: false, codec: null, reason: "missing" };
    }
    try {
      const aac = await AudioEncoder.isConfigSupported({ ...AUDIO_CONFIG });
      if (aac.supported) return { supported: true, codec: "aac", reason: null };
    } catch {
      // Fall through to the Opus probe.
    }
    try {
      const opus = await AudioEncoder.isConfigSupported({ ...OPUS_AUDIO_CONFIG });
      if (opus.supported) return { supported: true, codec: "opus", reason: null };
    } catch {
      return { supported: false, codec: null, reason: "error" };
    }
    return { supported: false, codec: null, reason: "unsupported" };
  } catch {
    return { supported: false, codec: null, reason: "error" };
  }
}

export interface MediaRecorderProbe {
  supported: boolean;
  mimeType: string | null;
}

/** Last-resort path: canvas.captureStream + MediaRecorder. Never throws. */
export function probeMediaRecorder(): MediaRecorderProbe {
  try {
    if (typeof MediaRecorder === "undefined") return { supported: false, mimeType: null };
    if (typeof HTMLCanvasElement !== "undefined") {
      const canvas = document.createElement("canvas");
      if (typeof canvas.captureStream !== "function") return { supported: false, mimeType: null };
    }
    const canType = (mime: string): boolean => {
      try {
        return typeof MediaRecorder.isTypeSupported === "function" ? MediaRecorder.isTypeSupported(mime) : true;
      } catch {
        return false;
      }
    };
    for (const mime of MEDIA_RECORDER_MIMES) {
      if (canType(mime)) return { supported: true, mimeType: mime };
    }
    return { supported: true, mimeType: "" };
  } catch {
    return { supported: false, mimeType: null };
  }
}
