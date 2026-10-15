import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import {
  AUDIO_CONFIG,
  RESUME_QUEUE,
  VIDEO_CONFIG,
  type FromWorker,
  type ToWorker,
} from "./export-worker-protocol";

/**
 * Browser export worker: VideoEncoder + AudioEncoder + mp4-muxer live here,
 * off the main thread. The main thread keeps canvas drawing (video elements
 * can't cross the thread boundary) and transfers each finished frame as a
 * VideoFrame; audio arrives as AudioData. Same codec configs as the old
 * inline path — only the thread changed.
 *
 * Protocol (main -> worker): init{voice} | frame{frame,keyFrame} |
 * audio{data} | finish{} | abort{}.
 * Protocol (worker -> main): ready{} | accepted{queue} | done{buffer} |
 * error{message} | aborted{}. Nothing here ever throws out of onmessage —
 * failures arrive as error{} so the main thread can fail the export cleanly.
 */

export interface MuxerLike {
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
  finalize(): void;
  target: { buffer: ArrayBuffer };
}
export interface EncoderLike<Config> {
  readonly encodeQueueSize: number;
  readonly state: CodecState;
  /** Drain notifications (real VideoEncoder.ondequeue). Fakes may omit it. */
  ondequeue?: unknown;
  configure(config: Config): void;
  encode(frame: VideoFrame | AudioData, options?: { keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
}
export type VideoChunkOut = (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) => void;
export type AudioChunkOut = (chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata) => void;
export interface WorkerDeps {
  createMuxer(voice: boolean): MuxerLike;
  createVideoEncoder(output: VideoChunkOut, onError: (e: unknown) => void): EncoderLike<VideoEncoderConfig>;
  createAudioEncoder(output: AudioChunkOut, onError: (e: unknown) => void): EncoderLike<AudioEncoderConfig>;
}
export interface WorkerScope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  setOnMessage(handler: (message: ToWorker) => void): void;
}

const realDeps: WorkerDeps = {
  createMuxer: (voice: boolean) =>
    voice
      ? new Muxer({
          target: new ArrayBufferTarget(),
          video: { codec: "avc", width: VIDEO_CONFIG.width, height: VIDEO_CONFIG.height },
          audio: { codec: "aac", sampleRate: AUDIO_CONFIG.sampleRate, numberOfChannels: AUDIO_CONFIG.numberOfChannels },
          fastStart: "in-memory",
        })
      : new Muxer({
          target: new ArrayBufferTarget(),
          video: { codec: "avc", width: VIDEO_CONFIG.width, height: VIDEO_CONFIG.height },
          fastStart: "in-memory",
        }),
  createVideoEncoder: (output, onError) => new VideoEncoder({ output, error: onError as ErrorCallback }),
  createAudioEncoder: (output, onError) => new AudioEncoder({ output, error: onError as ErrorCallback }),
};

interface Session {
  muxer: MuxerLike;
  video: EncoderLike<VideoEncoderConfig>;
  audio: EncoderLike<AudioEncoderConfig> | null;
  voice: boolean;
  videoErr: unknown;
  audioErr: unknown;
  finished: boolean;
}

function fail(scope: WorkerScope, message: string): void {
  try {
    scope.postMessage({ type: "error", message });
  } catch {
    // Last resort: nothing left to signal with.
  }
}

export function startWorker(deps: WorkerDeps = realDeps, scope?: WorkerScope): void {
  let session: Session | null = null;

  // Production channel (real worker global) when tests haven't injected a
  // scope. Every post below goes through this — posting via the injected
  // scope alone leaves the production handler with undefined, so `init`
  // throws and the main thread dies on the E_ENCODER_INIT timeout.
  const globalScope = scope ? null : (self as unknown as {
    postMessage(message: FromWorker, transfer?: Transferable[]): void;
    onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
  });
  const channel: WorkerScope = scope ?? {
    postMessage: (message, transfer) => globalScope!.postMessage(message, transfer),
    setOnMessage: (handler) => {
      globalScope!.onmessage = (event) => handler(event.data);
    },
  };

  const reset = () => {
    if (session) {
      try {
        if (session.video.state !== "closed") session.video.close();
      } catch {
        // Close is best-effort during teardown.
      }
      try {
        if (session.audio && session.audio.state !== "closed") session.audio.close();
      } catch {
        // Close is best-effort during teardown.
      }
    }
    session = null;
  };

  const handle = (message: ToWorker) => {
    try {
      if (message.type === "abort") {
        reset();
        channel.postMessage({ type: "aborted" });
        return;
      }
      if (message.type === "init") {
        reset();
        const muxer = deps.createMuxer(message.voice);
        const next: Session = {
          muxer,
          video: null as unknown as EncoderLike<VideoEncoderConfig>,
          audio: null,
          voice: message.voice,
          videoErr: null,
          audioErr: null,
          finished: false,
        };
        next.video = deps.createVideoEncoder(
          (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
          (e) => {
            next.videoErr = e;
          },
        );
        next.video.configure({ ...VIDEO_CONFIG });
        // Backpressure drain: the main thread parks once its last-seen queue
        // passes MAX_QUEUE and only resumes on a future `accepted <=
        // RESUME_QUEUE`. Without a drain signal that future message only
        // arrives after the next `frame` — which a parked main thread never
        // sends. Forward the encoder's dequeue event so the gate releases as
        // the hardware encoder drains; otherwise any slow encoder (Edge on
        // integrated GPUs) stalls forever once the queue fills. Throttled to
        // the resume threshold so a fast encoder doesn't spam drain hints.
        try {
          (next.video as unknown as { ondequeue?: (() => void) | null }).ondequeue = () => {
            try {
              if (session === next && !next.finished && next.video.state !== "closed" && next.video.encodeQueueSize <= RESUME_QUEUE) {
                channel.postMessage({ type: "accepted", queue: next.video.encodeQueueSize });
              }
            } catch {
              // Drain hints are best-effort; the stall watchdog owns failure.
            }
          };
        } catch {
          // Encoders without dequeue support keep the old behavior.
        }
        if (message.voice) {
          next.audio = deps.createAudioEncoder(
            (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
            (e) => {
              next.audioErr = e;
            },
          );
          next.audio.configure({ ...AUDIO_CONFIG });
        }
        session = next;
        channel.postMessage({ type: "ready" });
        return;
      }
      if (!session || session.finished) {
        fail(channel, "Export session is not initialized.");
        return;
      }
      if (message.type === "frame") {
        try {
          session.video.encode(message.frame, { keyFrame: message.keyFrame });
        } finally {
          try {
            message.frame.close();
          } catch {
            // Frame release is best-effort.
          }
        }
        channel.postMessage({ type: "accepted", queue: session.video.encodeQueueSize });
        return;
      }
      if (message.type === "audio") {
        if (!session.audio) {
          try {
            message.data.close();
          } catch {
            // Release is best-effort.
          }
          fail(channel, "Audio data sent to a voiceless session.");
          return;
        }
        try {
          session.audio.encode(message.data);
        } finally {
          try {
            message.data.close();
          } catch {
            // Release is best-effort.
          }
        }
        return;
      }
      // finish
      void (async () => {
        try {
          channel.postMessage({ type: "stage", stage: "flushing-video" });
          await session!.video.flush();
          if (session!.videoErr) throw session!.videoErr;
          if (session!.voice && session!.audio) {
            channel.postMessage({ type: "stage", stage: "flushing-audio" });
            await session!.audio.flush();
            if (session!.audioErr) throw session!.audioErr;
          }
          channel.postMessage({ type: "stage", stage: "finalizing" });
          session!.muxer.finalize();
          session!.finished = true;
          const buffer = session!.muxer.target.buffer;
          channel.postMessage({ type: "done", buffer }, [buffer]);
        } catch (error) {
          fail(channel, error instanceof Error ? error.message : String(error));
        } finally {
          reset();
        }
      })();
    } catch (error) {
      fail(channel, error instanceof Error ? error.message : String(error));
    }
  };

  if (scope) {
    scope.setOnMessage(handle);
    return;
  }
  channel.setOnMessage(handle);
}

// Auto-start in a real worker global only: main-thread `self` is `window`.
try {
  const candidate = self as unknown as { window?: unknown };
  if (typeof self !== "undefined" && candidate.window === undefined) startWorker();
} catch {
  // Module import context (tests, SSR): start explicitly via startWorker().
}
