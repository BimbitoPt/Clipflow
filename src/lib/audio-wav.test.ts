import { describe, expect, it } from "vitest";
import { pcmToWavBuffer } from "./audio-wav";

describe("pcmToWavBuffer", () => {
  it("writes a valid 16-bit mono header", () => {
    const pcm = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buffer = pcmToWavBuffer(pcm, 24000);
    expect(buffer.byteLength).toBe(44 + 5 * 2);
    const view = new DataView(buffer);
    const ascii = (offset: number, length: number) =>
      Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(ascii(36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(10);
  });

  it("clamps out-of-range samples instead of wrapping", () => {
    const pcm = new Float32Array([2, -2]);
    const view = new DataView(pcmToWavBuffer(pcm, 8000));
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });

  it("handles empty input", () => {
    const buffer = pcmToWavBuffer(new Float32Array(0), 24000);
    expect(buffer.byteLength).toBe(44);
    expect(new DataView(buffer).getUint32(40, true)).toBe(0);
  });
});
