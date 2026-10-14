/**
 * Voice-audio bytes for the desktop render bridge.
 *
 * `begin_render` used to receive `Array.from(pcm)`: every f32 sample boxed as
 * a JS number, then JSON-serialized one by one (~5x the raw size for typical
 * voice, and minutes of GC pressure at the 10-minute cap). Instead the
 * renderer ships the `Float32Array` storage verbatim as an
 * `application/octet-stream` body to `prepare_audio`, which decodes
 * little-endian f32s on the Rust side. See docs/codebase-review.md (P1,
 * desktop audio transport).
 *
 * All supported targets (x64 Windows, x64/ARM macOS) are little-endian, which
 * is what the native side decodes. A big-endian browser would need a byte
 * swap here — none exists among Tauri's desktop targets.
 *
 * The audio contract is explicit: `DESKTOP_AUDIO_CONFIG` is the single source
 * of truth for sample rate / channel count / wire format, sent as IPC headers
 * with every `prepare_audio` call and validated by the Rust side
 * (src-tauri/src/render.rs). The resample to this rate happens once in
 * useExportController before renderDesktop, so a mismatch is a bug — never
 * silently re-interpreted.
 */

export const DESKTOP_AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  format: "f32le",
  maxSeconds: 600,
} as const;

/** IPC header names carrying the explicit audio contract. */
export const AUDIO_HEADER_RATE = "x-clipflow-audio-rate";
export const AUDIO_HEADER_CHANNELS = "x-clipflow-audio-channels";
export const AUDIO_HEADER_FORMAT = "x-clipflow-audio-format";

/** Headers `renderDesktop` attaches to the `prepare_audio` binary body. */
export function desktopAudioHeaders(): Record<string, string> {
  return {
    [AUDIO_HEADER_RATE]: String(DESKTOP_AUDIO_CONFIG.sampleRate),
    [AUDIO_HEADER_CHANNELS]: String(DESKTOP_AUDIO_CONFIG.channels),
    [AUDIO_HEADER_FORMAT]: DESKTOP_AUDIO_CONFIG.format,
  };
}

/** Max samples the native side stages (rate × cap), mirroring render.rs. */
export function maxDesktopPcmSamples(): number {
  return DESKTOP_AUDIO_CONFIG.sampleRate * DESKTOP_AUDIO_CONFIG.maxSeconds;
}

/**
 * View the samples' bytes with no copy when the view already covers its whole
 * buffer, otherwise copy the covered range into an exact-sized array. Either
 * way the returned bytes are exactly `pcm.length * 4` little-endian f32s.
 */
export function f32ToLeBytes(pcm: Float32Array): Uint8Array {
  if (pcm.byteOffset === 0 && pcm.byteLength === pcm.buffer.byteLength) {
    return new Uint8Array(pcm.buffer);
  }
  const copy = new Uint8Array(pcm.byteLength);
  copy.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  return copy;
}
