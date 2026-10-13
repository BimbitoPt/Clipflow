import { describe, expect, it } from "vitest";
import { FrameBatcher, HEADER_FRAME_COUNT, HEADER_RENDER_ID, rgbaFrameBytes } from "./frame-batch";

const FRAME_BYTES = rgbaFrameBytes(720, 1280);

/** A frame of `size` bytes all set to `fill`, so batches can be told apart. */
function frame(fill: number, size = 4): Uint8ClampedArray {
  return new Uint8ClampedArray(size).fill(fill);
}

/** Concatenate everything a batcher produced into one byte string. */
function drain(batcher: FrameBatcher, frames: number[], capacity: number): { bytes: Uint8Array; frames: number }[] {
  const out: { bytes: Uint8Array; frames: number }[] = [];
  for (const fill of frames) {
    const batch = batcher.add(frame(fill));
    if (batch) out.push({ bytes: batch.bytes.slice(), frames: batch.frames });
  }
  const tail = batcher.flush();
  if (tail) out.push({ bytes: tail.bytes.slice(), frames: tail.frames });
  expect(out.length).toBe(Math.ceil(frames.length / capacity));
  return out;
}

describe("rgbaFrameBytes", () => {
  it("counts four bytes per pixel", () => {
    expect(rgbaFrameBytes(720, 1280)).toBe(3_686_400);
    expect(rgbaFrameBytes(1, 1)).toBe(4);
  });
});

describe("FrameBatcher", () => {
  it("rejects a non-positive frame size", () => {
    expect(() => new FrameBatcher(0, 4)).toThrow(/positive integer/);
    expect(() => new FrameBatcher(-4, 4)).toThrow(/positive integer/);
    expect(() => new FrameBatcher(1.5, 4)).toThrow(/positive integer/);
  });

  it("rejects a batch capacity below one", () => {
    expect(() => new FrameBatcher(4, 0)).toThrow(/>= 1/);
    expect(() => new FrameBatcher(4, -1)).toThrow(/>= 1/);
  });

  it("exposes its capacity", () => {
    expect(new FrameBatcher(4, 7).capacity).toBe(7);
  });

  it("holds frames until the batch is full", () => {
    const batcher = new FrameBatcher(4, 3);
    expect(batcher.add(new Uint8ClampedArray(4))).toBeNull();
    expect(batcher.add(new Uint8ClampedArray(4))).toBeNull();
    const batch = batcher.add(new Uint8ClampedArray(4));
    expect(batch?.frames).toBe(3);
    expect(batch?.bytes.length).toBe(12);
  });

  it("emits full batches back to back without stalling", () => {
    const batcher = new FrameBatcher(4, 2);
    batcher.add(new Uint8ClampedArray(4));
    expect(batcher.add(new Uint8ClampedArray(4))?.frames).toBe(2);
    batcher.add(new Uint8ClampedArray(4));
    expect(batcher.add(new Uint8ClampedArray(4))?.frames).toBe(2);
  });

  it("counts frames across a whole export, including the tail", () => {
    // 10 frames at capacity 4 is 4 + 4 + 2 — the shape of a real 30 fps export.
    const batches = drain(new FrameBatcher(4, 4), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
    expect(batches.map((b) => b.frames)).toEqual([4, 4, 2]);
    expect(batches.reduce((n, b) => n + b.frames, 0)).toBe(10);
  });

  it("preserves frame order and byte content", () => {
    const fills = [11, 12, 13, 14, 15, 16, 17];
    const batches = drain(new FrameBatcher(4, 3), fills, 3);
    const seen: number[] = [];
    for (const batch of batches) {
      for (let i = 0; i < batch.frames; i++) {
        const offset = i * 4;
        // Each frame is four identical bytes; check the first and last.
        expect(batch.bytes[offset]).toBe(batch.bytes[offset + 3]);
        seen.push(batch.bytes[offset]!);
      }
    }
    expect(seen).toEqual(fills);
  });

  it("keeps a handed-back batch intact while the next one fills", () => {
    // The batcher alternates two fixed slots. That is what lets the renderer
    // keep one batch in flight while drawing the next, without either the
    // in-flight bytes or the ones being drawn getting clobbered.
    const batcher = new FrameBatcher(4, 2);
    batcher.add(frame(1));
    const first = batcher.add(frame(2))!;
    // Second slot is now filling; the first batch must be untouched.
    batcher.add(frame(3));
    expect(Array.from(first.bytes)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    const second = batcher.add(frame(4))!;
    expect(Array.from(second.bytes)).toEqual([3, 3, 3, 3, 4, 4, 4, 4]);
    expect(first.frames).toBe(2);
  });

  it("copies the tail so later renders cannot overwrite it", () => {
    const batcher = new FrameBatcher(4, 4);
    batcher.add(frame(9));
    const tail = batcher.flush()!;
    expect(tail.frames).toBe(1);
    // A second export reusing the batcher must not disturb the handed-back tail.
    batcher.add(frame(7));
    batcher.add(frame(7));
    batcher.add(frame(7));
    batcher.add(frame(7));
    expect(Array.from(tail.bytes)).toEqual([9, 9, 9, 9]);
  });

  it("returns null from flush when nothing is pending", () => {
    const batcher = new FrameBatcher(4, 4);
    expect(batcher.flush()).toBeNull();
    batcher.add(new Uint8ClampedArray(4));
    batcher.flush();
    expect(batcher.flush()).toBeNull();
  });

  it("resets cleanly after a flush", () => {
    const batcher = new FrameBatcher(4, 4);
    batcher.add(frame(3));
    expect(batcher.flush()?.frames).toBe(1);
    batcher.add(frame(4));
    batcher.add(frame(4));
    expect(batcher.flush()?.frames).toBe(2);
  });

  it("rejects pixels of the wrong length", () => {
    const batcher = new FrameBatcher(4, 2);
    expect(() => batcher.add(new Uint8ClampedArray(3))).toThrow(/expected 4 bytes/);
    expect(() => batcher.add(new Uint8ClampedArray(5))).toThrow(/expected 4 bytes/);
  });

  it("handles the single-frame-per-batch edge case", () => {
    const batches = drain(new FrameBatcher(4, 1), [1, 2, 3], 1);
    expect(batches.map((b) => b.frames)).toEqual([1, 1, 1]);
  });

  it("reports the same byte count the Rust side validates", () => {
    // Desktop export uses these exact constants; a drift here would make
    // render_frames reject every batch as the wrong size.
    const batcher = new FrameBatcher(FRAME_BYTES, 4);
    let batch: ReturnType<FrameBatcher["add"]> = null;
    for (let i = 0; i < 4; i++) batch = batcher.add(new Uint8ClampedArray(FRAME_BYTES));
    expect(batch?.bytes.length).toBe(FRAME_BYTES * 4);
    expect(batch?.frames).toBe(4);
  });
});

describe("IPC headers", () => {
  it("uses the header names the Rust side reads", () => {
    // src-tauri/src/render.rs keys on these exact strings.
    expect(HEADER_RENDER_ID).toBe("x-clipflow-render-id");
    expect(HEADER_FRAME_COUNT).toBe("x-clipflow-frame-count");
  });
});
