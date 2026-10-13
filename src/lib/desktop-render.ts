import { invoke } from '@tauri-apps/api/core';
import type { PlannedFrame } from './planner';
import { drawFrame, type DrawCtx, type RenderExtra } from './render';
import type { Theme } from './packs';
import type { StockAsset } from './broll';
import { FrameBatcher, HEADER_FRAME_COUNT, HEADER_RENDER_ID, rgbaFrameBytes } from './frame-batch';

const FRAME_W = 720;
const FRAME_H = 1280;
/**
 * Frames per IPC call. At 720x1280 RGBA a batch is ~14.7 MB — large enough that
 * a 1,350-frame export costs ~340 invokes instead of 1,350, small enough that
 * only two batches are ever resident (see FrameBatcher).
 */
const BATCH_FRAMES = 4;

export interface DesktopRenderInput {
  frames: PlannedFrame[]; assets: Array<StockAsset | null>; theme: Theme; extra: RenderExtra;
  duration: number; pcm: Float32Array | null; signal: AbortSignal;
  /** Frames at or past this timestamp render the opt-in credit card. */
  endCardAfter?: number;
  cueIndex: (frame: PlannedFrame) => number;
  seek: (video: HTMLVideoElement, t: number) => Promise<void>;
  progress: (percent: number, message: string) => void;
}

/**
 * Push raw RGBA frames to the native encoder.
 *
 * Frames leave the renderer as raw pixels rather than PNG: `getImageData`
 * instead of `toDataURL`, forwarded verbatim as an `application/octet-stream`
 * body. The renderer never compresses what FFmpeg is about to decompress.
 *
 * Batches are dispatched strictly in order — at most one is in flight — because
 * FFmpeg reads a single stdin and the Rust side has no ordering guarantee across
 * concurrent commands. Drawing the next batch still overlaps the previous
 * batch's transfer, so the encoder stays fed without risking a scrambled file.
 */
export async function renderDesktop(input: DesktopRenderInput): Promise<string | null> {
  input.signal.throwIfAborted();
  const job = await invoke<{id: string; output: string} | null>('begin_render', {
    frames: input.frames.length, width: FRAME_W, height: FRAME_H,
    pcm: input.pcm ? Array.from(input.pcm) : null,
  });
  if (!job) return null;
  if (input.signal.aborted) { await invoke('cancel_render', { id: job.id }); throw new Error('Export cancelled.'); }
  const cancel = () => { void invoke('cancel_render', { id: job.id }).catch(() => {}); };
  input.signal.addEventListener('abort', cancel);
  const canvas = document.createElement('canvas'); canvas.width = FRAME_W; canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const batcher = new FrameBatcher(rgbaFrameBytes(FRAME_W, FRAME_H), BATCH_FRAMES);
  // Ordering gate for batch dispatch. `inFlight` never rejects (failures are
  // parked in `firstError`), so a slow encoder can never surface as an
  // unhandled rejection while the loop is still drawing.
  let inFlight: Promise<void> = Promise.resolve();
  let firstError: unknown = null;
  const dispatch = async (bytes: Uint8Array, frames: number): Promise<void> => {
    await inFlight;
    if (firstError) throw firstError;
    inFlight = invoke<number>('render_frames', bytes, {
      headers: { [HEADER_RENDER_ID]: job.id, [HEADER_FRAME_COUNT]: String(frames) },
    }).then(() => {}, (error: unknown) => { firstError ??= error; });
  };
  try {
    if (!ctx) throw new Error('Canvas rendering is unavailable.');
    for (let i = 0; i < input.frames.length; i++) {
      input.signal.throwIfAborted();
      const frame = input.frames[i]!;
      const asset = input.assets[input.cueIndex(frame)];
      if (asset?.kind === 'video') { const video = asset.el as HTMLVideoElement; video.pause(); await seekNativeVideo(video, frame.t); }
      drawFrame(ctx as DrawCtx, frame, input.theme, FRAME_W, FRAME_H, { ...input.extra, asset: asset ?? undefined, endCard: input.endCardAfter !== undefined && frame.t >= input.endCardAfter }, input.duration);
      const batch = batcher.add(ctx.getImageData(0, 0, FRAME_W, FRAME_H).data);
      if (batch) await dispatch(batch.bytes, batch.frames);
      if (i % 15 === 0) input.progress(65 + Math.round(30 * (i + 1) / input.frames.length), `Rendering frame ${i + 1}/${input.frames.length}`);
    }
    input.signal.throwIfAborted();
    const tail = batcher.flush();
    if (tail) await dispatch(tail.bytes, tail.frames);
    await inFlight;
    if (firstError) throw firstError;
    input.progress(97, 'Finishing native MP4…');
    return await invoke<string>('finish_render', { id: job.id });
  } catch (error) {
    await invoke('cancel_render', { id: job.id }).catch(() => {});
    if (input.signal.aborted) throw new Error('Export cancelled. Your project is unchanged.');
    throw error;
  } finally { input.signal.removeEventListener('abort', cancel); }
}

async function seekNativeVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('The selected video has no playable duration. Convert it to MP4 and reimport it.');
  const target = time % video.duration;
  if (Math.abs(video.currentTime - target) < .001 && video.readyState >= 2) return;
  await new Promise<void>((resolve,reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Could not decode the selected video frame. Convert it to MP4 and reimport it.')); };
    const cleanup = () => { clearTimeout(timer); video.removeEventListener('seeked', done); video.removeEventListener('error', fail); };
    const timer = setTimeout(fail, 5000);
    video.addEventListener('seeked', done, {once: true}); video.addEventListener('error', fail, {once: true});
    video.currentTime = target;
  });
}
