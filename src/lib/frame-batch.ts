/**
 * Frame batching for the desktop render bridge.
 *
 * The native side consumes raw RGB24 pixels through a Tauri *raw-binary* IPC body
 * (`InvokeBody::Raw`, sent as `application/octet-stream`), so every byte here is
 * forwarded verbatim: no `canvas.toDataURL("image/png")`, no base64, no JSON
 * string escaping. See docs/codebase-review.md (P1, desktop frame transport).
 * Alpha is dropped at pack time (`packRgb24`): every exported pixel is fully
 * opaque, so the channel carries no information and RGB24 cuts wire bytes 25%.
 *
 * Batching exists to keep the IPC call count bounded. A 45 s / 30 fps export is
 * 1,350 frames; one invoke per frame dominated the export with serialization and
 * dispatch overhead. A batcher instead coalesces N frames into a single body.
 *
 * The buffer is a fixed pair that alternates, never a growing list: the render
 * loop hands a full batch to the sender and immediately starts filling the other
 * slot, so at most two batches are ever resident. Peak extra memory is therefore
 * `2 * batchFrames * frameBytes` regardless of export length.
 */

/** Header carrying the render job id (mirrored in src-tauri/src/render.rs). */
export const HEADER_RENDER_ID = "x-clipflow-render-id";
/** Header carrying the number of frames packed into the body (mirrored in Rust). */
export const HEADER_FRAME_COUNT = "x-clipflow-frame-count";

/** A packed run of whole frames, ready to be handed to `invoke`. */
export interface FrameBatch {
  /** Raw RGB24 bytes, exactly `frames * frameBytes` long. */
  readonly bytes: Uint8Array;
  /** How many frames `bytes` contains; always >= 1. */
  readonly frames: number;
}

export class FrameBatcher {
  private readonly frameBytes: number;
  private readonly batchFrames: number;
  /** Two fixed slots, alternated on hand-off, so a batch can be sent while the next one fills. */
  private readonly slots: [Uint8Array, Uint8Array];
  private slot = 0;
  private used = 0;

  constructor(frameBytes: number, batchFrames: number) {
    if (!Number.isInteger(frameBytes) || frameBytes <= 0) {
      throw new Error(`FrameBatcher: frameBytes must be a positive integer, got ${frameBytes}`);
    }
    if (!Number.isInteger(batchFrames) || batchFrames < 1) {
      throw new Error(`FrameBatcher: batchFrames must be >= 1, got ${batchFrames}`);
    }
    this.frameBytes = frameBytes;
    this.batchFrames = batchFrames;
    const cap = frameBytes * batchFrames;
    this.slots = [new Uint8Array(cap), new Uint8Array(cap)];
  }

  /** Frames this batcher accumulates before handing a batch back. */
  get capacity(): number {
    return this.batchFrames;
  }

  /**
   * Copy one frame's pixels in. Returns a full batch once `batchFrames` frames
   * have accumulated, otherwise null — the caller keeps drawing.
   */
  add(pixels: ArrayLike<number>): FrameBatch | null {
    if (pixels.length !== this.frameBytes) {
      throw new Error(`FrameBatcher: expected ${this.frameBytes} bytes of pixels, got ${pixels.length}`);
    }
    const buffer = this.slots[this.slot]!;
    buffer.set(pixels, this.used);
    this.used += this.frameBytes;
    if (this.used < buffer.length) return null;
    this.used = 0;
    this.slot ^= 1;
    return { bytes: buffer, frames: this.batchFrames };
  }

  /**
   * Hand back any trailing partial batch. The bytes are copied into an
   * exact-sized array: the slot is reused by later renders, so a view would be
   * aliasing memory the next export overwrites.
   */
  flush(): FrameBatch | null {
    if (this.used === 0) return null;
    const frames = this.used / this.frameBytes;
    const bytes = this.slots[this.slot]!.slice(0, this.used);
    this.used = 0;
    return { bytes, frames };
  }
}

/** Bytes per frame for an RGBA canvas of the given size. */
export function rgbaFrameBytes(width: number, height: number): number {
  return width * height * 4;
}

/** Bytes per frame once the (always opaque — see benchmark RGB24 gate) alpha channel is dropped. */
export function rgbFrameBytes(width: number, height: number): number {
  return width * height * 3;
}

/**
 * Pack one RGBA frame into RGB triplets, dropping alpha.
 *
 * The renderer draws every frame over a fully opaque background and the
 * benchmark's RGB24 gate asserts alpha is 255 on sampled frames, so the
 * dropped channel carries no information. `dst` must have room for
 * `src.length / 4 * 3` bytes at `dstByteOffset`.
 */
export function packRgb24(src: ArrayLike<number>, dst: Uint8Array, dstByteOffset: number): void {
  if (src.length % 4 !== 0) {
    throw new Error(`packRgb24: expected a whole number of RGBA pixels, got ${src.length} bytes`);
  }
  const need = (src.length / 4) * 3;
  if (dstByteOffset < 0 || dst.length - dstByteOffset < need) {
    throw new Error(`packRgb24: need ${need} bytes at offset ${dstByteOffset}, dst has ${dst.length}`);
  }
  let j = dstByteOffset;
  for (let i = 0; i < src.length; i += 4) {
    dst[j++] = src[i]!;
    dst[j++] = src[i + 1]!;
    dst[j++] = src[i + 2]!;
  }
}
