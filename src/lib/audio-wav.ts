/**
 * PCM → 16-bit mono WAV. The sidecar guarantees the voice is never lost when
 * the video container degrades (Opus-in-MP4, WebM, or silent fallback).
 * Pure function: no DOM, fully unit-testable.
 */
export function pcmToWavBuffer(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const frames = pcm.length;
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + frames * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

export function pcmToWavBlob(pcm: Float32Array, sampleRate: number): Blob {
  return new Blob([pcmToWavBuffer(pcm, sampleRate)], { type: "audio/wav" });
}
