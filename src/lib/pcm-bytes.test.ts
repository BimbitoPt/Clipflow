import { describe, expect, it } from "vitest";
import { f32ToLeBytes } from "./pcm-bytes";

function readLeF32(bytes: Uint8Array, index: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(index * 4, true);
}

describe("f32ToLeBytes", () => {
  it("round-trips sample values as little-endian f32", () => {
    const pcm = new Float32Array([1, -0.5, 0, 0.123456, -1]);
    const bytes = f32ToLeBytes(pcm);
    expect(bytes.length).toBe(pcm.length * 4);
    for (let i = 0; i < pcm.length; i++) {
      expect(readLeF32(bytes, i)).toBeCloseTo(pcm[i]!, 6);
    }
  });

  it("preserves non-finite bit patterns verbatim", () => {
    // The native side rejects NaN/infinity with a clear error; the byte layer
    // must not normalize them away first.
    const pcm = new Float32Array([Number.NaN, Number.POSITIVE_INFINITY]);
    const bytes = f32ToLeBytes(pcm);
    expect(Number.isNaN(readLeF32(bytes, 0))).toBe(true);
    expect(readLeF32(bytes, 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns a zero-copy view when the samples own their buffer", () => {
    const pcm = new Float32Array([0.25, 0.5]);
    const bytes = f32ToLeBytes(pcm);
    expect(bytes.buffer).toBe(pcm.buffer);
    expect(bytes.length).toBe(8);
  });

  it("copies exactly the covered range for an offset view", () => {
    // A view into a larger buffer must not leak neighboring bytes: a shifted
    // payload would move every sample the native side decodes.
    const backing = new Float32Array([9, 9, 0.25, 0.5, 9]);
    const pcm = new Float32Array(backing.buffer, 2 * 4, 2);
    const bytes = f32ToLeBytes(pcm);
    expect(bytes.length).toBe(8);
    expect(bytes.buffer).not.toBe(backing.buffer);
    expect(readLeF32(bytes, 0)).toBeCloseTo(0.25, 6);
    expect(readLeF32(bytes, 1)).toBeCloseTo(0.5, 6);
  });

  it("handles an empty track", () => {
    expect(f32ToLeBytes(new Float32Array(0)).length).toBe(0);
  });
});
