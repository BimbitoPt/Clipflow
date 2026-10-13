import type { CaptionPhrase } from "../../shared/caption-plan";
import type { VisualEffect } from "../../shared/visual-effects";
import { cueIndexOf, seekVideo } from "./app-utils";
import type { StockAsset } from "./broll";
import { AUDIO_CONFIG, MAX_QUEUE, RESUME_QUEUE, type FromWorker } from "./export-worker-protocol";
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
  const { script, theme, visualEffect, captionAnchor, captions, words, windows, baseDuration, creditOn, voiceOn, cueAssets, approvedProofByCue, pcm, signal } = req;
  req.onMessage("Muxing clipflow-916.mp4…");
  const withAudio = Boolean(voiceOn && pcm);
  const worker = new Worker(new URL("./export-worker.ts", import.meta.url), { type: "module" });
  let buffer: ArrayBuffer;
  // Stall watchdog: a hung encoder used to look identical to a slow one.
  // After 45s without a worker message, say so and name the way out instead
  // of spinning forever.
  let lastWorkerMsgAt = Date.now();
  const watchdog = setInterval(() => {
    const silentSec = Math.round((Date.now() - lastWorkerMsgAt) / 1000);
    if (silentSec >= 45) {
      req.onMessage(`Still encoding — no encoder response for ${silentSec}s. If this persists, restart Chrome or use the desktop app.`);
    }
  }, 5000);
  try {
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      let lastQueue = 0;
      let gate: (() => void) | null = null;
      let settled = false;
      const release = () => {
        const pending = gate;
        gate = null;
        if (pending) pending();
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        release();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      worker.onmessage = (event: MessageEvent<FromWorker>) => {
        const message = event.data;
        lastWorkerMsgAt = Date.now();
        if (message.type === "accepted") {
          lastQueue = message.queue;
          if (message.queue <= RESUME_QUEUE) release();
        } else if (message.type === "stage") {
          req.onMessage(
            message.stage === "flushing-video" ? "Flushing video encoder…"
            : message.stage === "flushing-audio" ? "Flushing voice encoder…"
            : "Finalizing MP4…",
          );
        } else if (message.type === "done") {
          if (settled) return;
          settled = true;
          release();
          resolve(message.buffer);
        } else if (message.type === "error") {
          fail(new Error(message.message));
        }
      };
      worker.onerror = (event) => fail(event instanceof ErrorEvent ? event.message : "Export worker failed.");
      signal.addEventListener("abort", () => {
        try {
          worker.postMessage({ type: "abort" });
        } catch {
          // Terminate below still releases the worker.
        }
        fail(new DOMException("Export cancelled.", "AbortError"));
      }, { once: true });
      void (async () => {
        try {
          worker.postMessage({ type: "init", voice: withAudio });
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
            if (n % 90 === 0) {
              req.onPercent(65 + Math.round((30 * n) / totalFrames));
              req.onMessage(`Muxing ${n}/${totalFrames} frames…`);
            }
            if (lastQueue > MAX_QUEUE) await new Promise<void>((resume) => {
              gate = resume;
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
            const vf = new VideoFrame(canvas, { timestamp: Math.round(f.t * 1e6) });
            await postFrame(vf, f.t < 1);
          }
          if (creditOn) {
            const cardFrames = Math.round(CREDIT_SECS * FPS);
            for (let i = 0; i < cardFrames; i++) {
              signal.throwIfAborted();
              const t = baseDuration + i / FPS;
              drawFrame(ctx as DrawCtx, { t, cue: script.cues[script.cues.length - 1]! }, theme, OUT_W, OUT_H, { endCard: true }, totalDuration);
              const vf = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6) });
              await postFrame(vf, i === 0);
            }
          }
          if (withAudio && pcm) {
            // Chrome only encodes AAC at 44.1/48 kHz — Kokoro speaks 24 kHz,
            // so upsample here. The desktop FFmpeg path gets a 16 kHz
            // downsample instead (Rust sink is pinned).
            const voice = resampleLinear(pcm, KOKORO_SAMPLE_RATE, AUDIO_CONFIG.sampleRate);
            const CHUNK = 1_000_000;
            for (let off = 0; off < voice.length; off += CHUNK) {
              signal.throwIfAborted();
              const slice = voice.slice(off, off + CHUNK);
              const ad = new AudioData({
                format: "f32",
                sampleRate: AUDIO_CONFIG.sampleRate,
                numberOfFrames: slice.length,
                numberOfChannels: 1,
                timestamp: Math.round((off * 1e6) / AUDIO_CONFIG.sampleRate),
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
          fail(error);
        }
      })();
    });
  } finally {
    clearInterval(watchdog);
    worker.terminate();
  }
  req.onPercent(100);
  req.onMessage("");
  return buffer;
}
