import type { CaptionPhrase } from "../../shared/caption-plan";
import type { VisualEffect } from "../../shared/visual-effects";
import { cueIndexOf, seekVideo } from "./app-utils";
import type { StockAsset } from "./broll";
import { AUDIO_CONFIG, MAX_QUEUE, OPUS_AUDIO_CONFIG, RESUME_QUEUE, VIDEO_FRAME_DURATION_US, type AudioCodec, type FromWorker } from "./export-worker-protocol";
import type { PlannedFrame, WordCue } from "./planner";
import { planFrames } from "./planner";
import { CREDIT_SECS, drawFrame, type DrawCtx, type RenderExtra } from "./render";
import type { VideoScript } from "./script";
import type { Theme } from "./packs";
import { KOKORO_SAMPLE_RATE, resampleLinear } from "./tts-local";

export const OUT_W = 720, OUT_H = 1280, OUT_NAME = "clipflow-916.mp4";
const FPS = 30;

/** Everything the browser encoder needs, resolved by the caller before the run. */
export interface BrowserExportRequest {
  script: VideoScript;
  theme: Theme;
  visualEffect: VisualEffect;
  /** Y anchor for captions, from the platform preset. */
  captionAnchor: number;
  captions: CaptionPhrase[];
  words: WordCue[] | undefined;
  /** Render grid: measured voice windows when present, else the fixed grid. */
  windows: Array<{ start: number; end: number }> | null;
  baseDuration: number;
  creditOn: boolean;
  voiceOn: boolean;
  /** AAC on Chrome/Edge/Safari, Opus on Firefox. Defaults to AAC. */
  audioCodec?: AudioCodec;
  cueAssets: Array<StockAsset | null>;
  approvedProofByCue: boolean[];
  /** 24 kHz mono voice, already trimmed/fitted/normalized; `null` = silent. */
  pcm: Float32Array | null;
  signal: AbortSignal;
  onMessage: (message: string) => void;
  onPercent: (percent: number) => void;
}

/**
 * Browser export: this thread draws frames (video elements can't cross the
 * worker boundary) and transfers each finished frame to the export worker,
 * which encodes + muxes. Backpressure via the worker queue keeps memory flat;
 * periodic yields keep the UI alive.
 *
 * Resolves with the encoded MP4 buffer. Rejects with an `AbortError` when the
 * caller's signal aborts, or with the worker's own error message.
 */
export async function runBrowserExport(req: BrowserExportRequest): Promise<ArrayBuffer> {
  const { script, theme, visualEffect, captionAnchor, captions, words, windows, baseDuration, creditOn, voiceOn, audioCodec = "aac", cueAssets, approvedProofByCue, pcm, signal } = req;
  req.onMessage("Muxing clipflow-916.mp4…");
  const withAudio = Boolean(voiceOn && pcm);
  const worker = new Worker(new URL("./export-worker-bootstrap.ts", import.meta.url), { type: "module" });
  let buffer: ArrayBuffer;
  try {
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      let lastQueue = 0;
      let framesAccepted = 0;
      let framesSent = 0;
      let gate: (() => void) | null = null;
      let settled = false;
      let lastWorkerMsgAt = Date.now();
      // Init handshake: the worker must answer `ready` once its encoders are
      // configured. A worker that never answers (blocked module load, missing
      // WebCodecs) previously looked like a slow encode until the 45s
      // watchdog; now it fails fast with a named cause.
      let readyRelease: () => void = () => {};
      const ready = new Promise<void>((resolveReady) => {
        readyRelease = resolveReady;
      });
      const release = () => {
        const pending = gate;
        gate = null;
        if (pending) pending();
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        release();
        readyRelease();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const settleDone = (value: ArrayBuffer) => {
        if (settled) return;
        settled = true;
        clearInterval(watchdog);
        clearTimeout(readyTimeout);
        release();
        readyRelease();
        resolve(value);
      };
      const settleFail = (error: unknown) => {
        clearInterval(watchdog);
        clearTimeout(readyTimeout);
        fail(error);
      };
      const readyTimeout = setTimeout(() => {
        const capabilities = [
          typeof VideoEncoder === "undefined" ? "VideoEncoder missing" : "VideoEncoder available",
          typeof AudioEncoder === "undefined" ? "AudioEncoder missing" : "AudioEncoder available",
          typeof VideoFrame === "undefined" ? "VideoFrame missing" : "VideoFrame available",
          typeof AudioData === "undefined" ? "AudioData missing" : "AudioData available",
        ].join(", ");
        settleFail(new Error(`E_ENCODER_INIT: worker did not send ready within 15s (${capabilities}). This usually means the worker module or one of its imports failed to load; check the browser console/network panel for export-worker-bootstrap or export-worker errors.`));
      }, 15000);
      void ready.then(() => clearTimeout(readyTimeout));
      // Stall watchdog: a hung encoder used to look identical to a slow one.
      // Warn at 45s with live counts; fail at 120s instead of spinning forever.
      const watchdog = setInterval(() => {
        if (settled) return;
        const silentSec = Math.round((Date.now() - lastWorkerMsgAt) / 1000);
        if (silentSec >= 120) {
          settleFail(new Error(`E_ENCODER_STALL: no encoder response for ${silentSec}s (sent ${framesSent} frames, ${framesAccepted} accepted, queue ${lastQueue}). Reload Edge/Chrome and retry, or use the desktop app.`));
        } else if (silentSec >= 45) {
          req.onMessage(`Still encoding — no encoder response for ${silentSec}s (sent ${framesSent}/${framesAccepted} frames, queue ${lastQueue}). If this persists, restart Edge/Chrome or use the desktop app.`);
        }
      }, 5000);
      worker.onmessage = (event: MessageEvent<FromWorker>) => {
        const message = event.data;
        lastWorkerMsgAt = Date.now();
        if (message.type === "ready") {
          readyRelease();
          return;
        }
        if (message.type === "accepted") {
          lastQueue = message.queue;
          framesAccepted += 1;
          if (message.queue <= RESUME_QUEUE) release();
        } else if (message.type === "stage") {
          req.onMessage(
            message.stage === "flushing-video" ? "Flushing video encoder…"
            : message.stage === "flushing-audio" ? "Flushing voice encoder…"
            : "Finalizing MP4…",
          );
        } else if (message.type === "done") {
          settleDone(message.buffer);
        } else if (message.type === "error") {
          settleFail(new Error(message.message));
        } else if (message.type === "aborted") {
          settleFail(new DOMException("Export cancelled.", "AbortError"));
        }
      };
      worker.onerror = (event) => {
        const detail = event instanceof ErrorEvent
          ? [event.message, event.filename ? `(${event.filename}:${event.lineno}:${event.colno})` : ""].filter(Boolean).join(" ")
          : "Unknown worker startup error.";
        settleFail(new Error(`E_ENCODER_WORKER: ${detail || "Worker module failed to load. Check the browser console and network panel."}`));
      };
      worker.onmessageerror = () => settleFail(new Error("Export worker message failed."));
      signal.addEventListener("abort", () => {
        try {
          worker.postMessage({ type: "abort" });
        } catch {
          // Terminate below still releases the worker.
        }
        settleFail(new DOMException("Export cancelled.", "AbortError"));
      }, { once: true });
      void (async () => {
        try {
          worker.postMessage({ type: "init", voice: withAudio, audioCodec });
          // Wait for the worker's encoders to configure before feeding
          // frames; without this a slow module load silently eats frames.
          await ready;
          signal.throwIfAborted();
          const canvas = document.createElement("canvas");
          canvas.width = OUT_W;
          canvas.height = OUT_H;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("E_CANVAS: 2d context unavailable");
          const frames: PlannedFrame[] = planFrames(script, FPS, windows, approvedProofByCue, cueAssets);
          const assetByCue = new Map<number, StockAsset | null>();
          script.cues.forEach((_cue, i) => assetByCue.set(i, cueAssets[i] ?? null));
          const totalDuration = baseDuration + (creditOn ? CREDIT_SECS : 0);
          const totalFrames = frames.length + (creditOn ? Math.round(CREDIT_SECS * FPS) : 0);
          const postFrame = async (vf: VideoFrame, keyFrame: boolean) => {
            try {
              worker.postMessage({ type: "frame", frame: vf, keyFrame }, [vf]);
            } catch (postError) {
              try {
                vf.close();
              } catch {
                // Release is best-effort; the post error carries the failure.
              }
              throw postError;
            }
            n++;
            framesSent += 1;
            if (n % 90 === 0) {
              req.onPercent(65 + Math.round((30 * n) / totalFrames));
              req.onMessage(`Muxing ${n}/${totalFrames} frames…`);
            }
            // Drain gate: pause feeding while the encoder is backed up. The
            // worker's dequeue forwarding resumes this once the hardware
            // encoder drains; the timeout turns a stuck encoder into a named
            // error instead of a silent hang.
            if (lastQueue > MAX_QUEUE) await new Promise<void>((resume, rejectGate) => {
              const timer = setTimeout(() => {
                if (gate === wrapped) {
                  gate = null;
                  rejectGate(new Error(`E_ENCODER_STALL: encoder queue stuck at ${lastQueue} with no drain — reload Edge/Chrome and retry, or use the desktop app.`));
                }
              }, 30000);
              const wrapped = () => {
                clearTimeout(timer);
                resume();
              };
              gate = wrapped;
            });
            if (n % 30 === 0) await new Promise((paint) => setTimeout(paint, 0));
          };
          let n = 0;
          for (const f of frames) {
            signal.throwIfAborted();
            const idx = cueIndexOf(script, f.cue);
            const asset = assetByCue.get(idx) ?? null;
            if (asset?.kind === "video") {
              const video = asset.el as HTMLVideoElement;
              video.pause();
              // Keep local stock video moving continuously across scene cuts.
              // Resetting to scene-local time made every beat reuse the same opening angle.
              const seek = Number.isFinite(video.duration) && video.duration > 0
                ? f.t % video.duration : f.t;
              await seekVideo(video, seek);
            }
            const extra: RenderExtra = {};
            extra.visualEffect = visualEffect;
            extra.captions = captions;
            extra.captionAnchor = captionAnchor;
            if (words) extra.words = words;
            if (asset) extra.asset = asset;
            drawFrame(ctx as DrawCtx, f, theme, OUT_W, OUT_H, extra, totalDuration);
            const vf = new VideoFrame(canvas, { timestamp: Math.round(f.t * 1e6), duration: VIDEO_FRAME_DURATION_US });
            await postFrame(vf, f.t < 1);
          }
          if (creditOn) {
            const cardFrames = Math.round(CREDIT_SECS * FPS);
            for (let i = 0; i < cardFrames; i++) {
              signal.throwIfAborted();
              const t = baseDuration + i / FPS;
              drawFrame(ctx as DrawCtx, { t, cue: script.cues[script.cues.length - 1]! }, theme, OUT_W, OUT_H, { endCard: true }, totalDuration);
              const vf = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: VIDEO_FRAME_DURATION_US });
              await postFrame(vf, i === 0);
            }
          }
          if (withAudio && pcm) {
            // Kokoro speaks 24 kHz — upsample to the encoder rate (AAC 44.1
            // kHz, Opus 48 kHz). The desktop FFmpeg path gets a 16 kHz
            // downsample instead (Rust sink is pinned).
            const targetRate = audioCodec === "opus" ? OPUS_AUDIO_CONFIG.sampleRate : AUDIO_CONFIG.sampleRate;
            const voice = resampleLinear(pcm, KOKORO_SAMPLE_RATE, targetRate);
            const CHUNK = 1_000_000;
            for (let off = 0; off < voice.length; off += CHUNK) {
              signal.throwIfAborted();
              const slice = voice.slice(off, off + CHUNK);
              const ad = new AudioData({
                format: "f32",
                sampleRate: targetRate,
                numberOfFrames: slice.length,
                numberOfChannels: 1,
                timestamp: Math.round((off * 1e6) / targetRate),
                data: slice,
              });
              try {
                worker.postMessage({ type: "audio", data: ad }, [ad]);
              } catch (postError) {
                try {
                  ad.close();
                } catch {
                  // Release is best-effort.
                }
                throw postError;
              }
            }
          }
          worker.postMessage({ type: "finish" });
        } catch (error) {
          settleFail(error);
        }
      })();
    });
  } finally {
    worker.terminate();
  }
  req.onPercent(100);
  req.onMessage("");
  return buffer;
}

export interface MediaRecorderResult {
  buffer: ArrayBuffer;
  mimeType: string;
}

/**
 * Last-resort export: realtime canvas.captureStream + MediaRecorder.
 * Used when WebCodecs VideoEncoder is missing (old Safari) — voice rides a
 * MediaStreamDestination, so no AudioEncoder is needed either.
 * Realtime by nature: a 45s video takes ~45s to record.
 */
export async function runMediaRecorderExport(req: BrowserExportRequest, mimeType: string): Promise<MediaRecorderResult> {
  const { script, theme, visualEffect, captionAnchor, captions, words, windows, baseDuration, creditOn, voiceOn, cueAssets, approvedProofByCue, pcm, signal } = req;
  const totalDuration = baseDuration + (creditOn ? CREDIT_SECS : 0);
  const canvas = document.createElement("canvas");
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("E_CANVAS: 2d context unavailable");
  const stream = canvas.captureStream(FPS);
  let audioCtx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  try {
    if (voiceOn && pcm) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) throw new Error("E_NO_AUDIOCTX: this browser has no AudioContext");
      audioCtx = new AC({ sampleRate: KOKORO_SAMPLE_RATE });
      const dest = audioCtx.createMediaStreamDestination();
      const audioBuffer = audioCtx.createBuffer(1, pcm.length, KOKORO_SAMPLE_RATE);
      audioBuffer.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
      source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(dest);
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
    }
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("E_RECORDER: MediaRecorder failed"));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }));
    });
    signal.addEventListener("abort", () => {
      try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* terminate below */ }
    }, { once: true });
    const frames: PlannedFrame[] = planFrames(script, FPS, windows, approvedProofByCue, cueAssets);
    const assetByCue = new Map<number, StockAsset | null>();
    script.cues.forEach((_cue, i) => assetByCue.set(i, cueAssets[i] ?? null));
    const frameAt = (t: number): PlannedFrame => {
      const clamped = Math.min(t, baseDuration - 1 / FPS);
      const idx = Math.max(0, Math.min(frames.length - 1, Math.floor((clamped / baseDuration) * frames.length)));
      return frames[idx]!;
    };
    req.onMessage("Recording in realtime (fallback encoder)…");
    recorder.start(1000);
    const startedAt = performance.now();
    try { await audioCtx?.resume(); } catch { /* autoplay policy: recorder still captures */ }
    try { source?.start(0); } catch { /* no audio */ }
    let n = 0;
    for (;;) {
      signal.throwIfAborted();
      const elapsed = (performance.now() - startedAt) / 1000;
      if (elapsed >= totalDuration) break;
      const t = elapsed;
      const f = t < baseDuration ? frameAt(t) : { t, cue: script.cues[script.cues.length - 1]! };
      const idx = cueIndexOf(script, f.cue);
      const asset = assetByCue.get(idx) ?? null;
      if (asset?.kind === "video") {
        const video = asset.el as HTMLVideoElement;
        try {
          if (video.paused) await video.play().catch(() => undefined);
          const seek = Number.isFinite(video.duration) && video.duration > 0 ? t % video.duration : t;
          if (Math.abs(video.currentTime - seek) > 0.4) await seekVideo(video, seek);
        } catch { /* keep last frame */ }
      }
      const extra: RenderExtra = {};
      if (t >= baseDuration) {
        drawFrame(ctx as DrawCtx, f, theme, OUT_W, OUT_H, { endCard: true }, totalDuration);
      } else {
        extra.visualEffect = visualEffect;
        extra.captions = captions;
        extra.captionAnchor = captionAnchor;
        if (words) extra.words = words;
        if (asset) extra.asset = asset;
        drawFrame(ctx as DrawCtx, f, theme, OUT_W, OUT_H, extra, totalDuration);
      }
      n += 1;
      if (n % 30 === 0) {
        req.onPercent(65 + Math.round((30 * Math.min(t, totalDuration)) / totalDuration));
        req.onMessage(`Recording ${Math.round(t)}s/${Math.round(totalDuration)}s (fallback)…`);
      }
      await new Promise((paint) => setTimeout(paint, Math.round(1000 / FPS)));
    }
    try { source?.stop(); } catch { /* already ended */ }
    await new Promise((tail) => setTimeout(tail, 300));
    if (recorder.state !== "inactive") recorder.stop();
    const blob = await done;
    req.onPercent(100);
    req.onMessage("");
    return { buffer: await blob.arrayBuffer(), mimeType: blob.type || mimeType };
  } finally {
    try { source?.disconnect(); } catch { /* best-effort */ }
    try { await audioCtx?.close(); } catch { /* best-effort */ }
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch { /* best-effort */ }
    }
  }
}
