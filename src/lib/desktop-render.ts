import { invoke } from '@tauri-apps/api/core';
import type { PlannedFrame } from './planner';
import { drawFrame, type DrawCtx, type RenderExtra } from './render';
import type { Theme } from './packs';
import type { StockAsset } from './broll';

export interface DesktopRenderInput {
  frames: PlannedFrame[]; assets: Array<StockAsset | null>; theme: Theme; extra: RenderExtra;
  duration: number; pcm: Float32Array | null; signal: AbortSignal;
  /** Frames at or past this timestamp render the opt-in credit card. */
  endCardAfter?: number;
  cueIndex: (frame: PlannedFrame) => number;
  seek: (video: HTMLVideoElement, t: number) => Promise<void>;
  progress: (percent: number, message: string) => void;
}
export async function renderDesktop(input: DesktopRenderInput): Promise<string | null> {
  input.signal.throwIfAborted();
  const job = await invoke<{id: string; output: string} | null>('begin_render', {
    frames: input.frames.length, pcm: input.pcm ? Array.from(input.pcm) : null,
  });
  if (!job) return null;
  if (input.signal.aborted) { await invoke('cancel_render', { id: job.id }); throw new Error('Export cancelled.'); }
  const cancel = () => { void invoke('cancel_render', { id: job.id }).catch(() => {}); };
  input.signal.addEventListener('abort', cancel);
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  try {
    if (!ctx) throw new Error('Canvas rendering is unavailable.');
    for (let i = 0; i < input.frames.length; i++) {
      input.signal.throwIfAborted();
      const frame = input.frames[i]!;
      const asset = input.assets[input.cueIndex(frame)];
      if (asset?.kind === 'video') { const video = asset.el as HTMLVideoElement; video.pause(); await seekNativeVideo(video, frame.t); }
      drawFrame(ctx as DrawCtx, frame, input.theme, 720, 1280, { ...input.extra, asset: asset ?? undefined, endCard: input.endCardAfter !== undefined && frame.t >= input.endCardAfter }, input.duration);
      await invoke('render_frame', { id: job.id, png: canvas.toDataURL('image/png').split(',')[1] });
      if (i % 15 === 0) input.progress(65 + Math.round(30 * (i + 1) / input.frames.length), `Rendering frame ${i + 1}/${input.frames.length}`);
    }
    input.signal.throwIfAborted();
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
