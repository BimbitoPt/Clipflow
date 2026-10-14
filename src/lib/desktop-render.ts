import { invoke } from '@tauri-apps/api/core';
import type { PlannedFrame } from './planner';
import { drawFrame, type DrawCtx, type RenderExtra } from './render';
import type { Theme } from './packs';
import type { StockAsset } from './broll';
import { FrameBatcher, HEADER_FRAME_COUNT, HEADER_RENDER_ID, packRgb24, rgbFrameBytes, rgbaFrameBytes } from './frame-batch';
import { f32ToLeBytes, desktopAudioHeaders, maxDesktopPcmSamples } from './pcm-bytes';

const FRAME_W = 720;
const FRAME_H = 1280;
const RGB_BYTES = rgbFrameBytes(FRAME_W, FRAME_H);
/**
 * Frames per IPC call. At 720x1280 RGB24 a batch is ~11 MB — large enough that
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
  progress: (percent: number, message: string) => void;
}

/**
 * Push raw RGB24 frames to the native encoder.
 *
 * Frames leave the renderer as raw pixels rather than PNG: `getImageData`,
 * alpha stripped (`packRgb24`), forwarded verbatim as an
 * `application/octet-stream` body. Every exported pixel is fully opaque, so
 * the dropped channel carries no information and RGB24 cuts wire bytes 25%
 * versus RGBA. The renderer never compresses what FFmpeg is about to
 * decompress.
 *
 * Voice audio goes up first as raw f32 bytes (`prepare_audio`), which stages
 * a WAV file the job claims by token — no `Array.from`, no per-sample JSON.
 * The audio contract (16 kHz mono f32le) travels as explicit IPC headers
 * (`desktopAudioHeaders`) and is validated natively; a single binary body is
 * used instead of chunks because the 10-minute cap bounds it to ~38 MB and
 * the native side stages it straight to a temp WAV the job claims by token.
 *
 * Batches are dispatched strictly in order — at most one is in flight — because
 * FFmpeg reads a single stdin and the Rust side has no ordering guarantee across
 * concurrent commands. Drawing the next batch still overlaps the previous
 * batch's transfer, so the encoder stays fed without risking a scrambled file.
 */
export async function renderDesktop(input: DesktopRenderInput): Promise<string | null> {
  input.signal.throwIfAborted();
  // Stage voice audio before the save dialog: begin_render spawns FFmpeg
  // immediately and FFmpeg opens its audio input at startup, so the WAV must
  // already exist. If the user then cancels the dialog, the native side
  // deletes the staged file.
  if (input.pcm && input.pcm.length > maxDesktopPcmSamples()) {
    throw new Error(`Voice audio is too long: ${input.pcm.length} samples exceeds the ${maxDesktopPcmSamples()}-sample (10-minute) cap.`);
  }
  const audioToken = input.pcm
    ? await invoke<string>('prepare_audio', f32ToLeBytes(input.pcm), {
      headers: desktopAudioHeaders(),
    })
    : null;
  const job = await invoke<{id: string; output: string} | null>('begin_render', {
    frames: input.frames.length, width: FRAME_W, height: FRAME_H, audioToken,
  });
  if (!job) return null;
  if (input.signal.aborted) { await invoke('cancel_render', { id: job.id }); throw new Error('Export cancelled.'); }
  const cancel = () => { void invoke('cancel_render', { id: job.id }).catch(() => {}); };
  input.signal.addEventListener('abort', cancel);
  const canvas = document.createElement('canvas'); canvas.width = FRAME_W; canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const batcher = new FrameBatcher(RGB_BYTES, BATCH_FRAMES);
  const scratch = new Uint8Array(RGB_BYTES);
  const scratchRgbaBytes = rgbaFrameBytes(FRAME_W, FRAME_H);
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
      const rgba = ctx.getImageData(0, 0, FRAME_W, FRAME_H).data;
      if (rgba.length !== scratchRgbaBytes) throw new Error(`Unexpected frame size: got ${rgba.length} bytes.`);
      packRgb24(rgba, scratch, 0);
      const batch = batcher.add(scratch);
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

/**
 * Strict frame-accurate seek for the native encode path. Deliberately private
 * and stricter than the browser export's best-effort `seekVideo`
 * (lib/app-utils.ts): a stale frame baked into the FFmpeg stdin is
 * unrecoverable, so unknown durations reject and the 5s timeout fails instead
 * of resolving. There is intentionally no injectable seek callback — one
 * implementation owns this responsibility.
 */
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
