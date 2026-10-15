import { describe, expect, it, vi } from "vitest";
import {
  AAC_FRAME_DURATION_US,
  AUDIO_CONFIG,
  OPUS_AUDIO_CONFIG,
  probeAudioConfig,
  probeMediaRecorder,
  probeVideoConfig,
  probeVoiceEncoder,
  VIDEO_CONFIG,
  VIDEO_FRAME_DURATION_US,
  type AudioCodec,
  type FromWorker,
  type ToWorker,
} from "./export-worker-protocol";
import {
  startWorker,
  type EncoderLike,
  type MuxerLike,
  type WorkerDeps,
  type WorkerScope,
} from "./export-worker";

interface FakeFrame {
  closed: boolean;
  close(): void;
}

function fakeFrame(): FakeFrame {
  const frame: FakeFrame = {
    closed: false,
    close: () => {
      frame.closed = true;
    },
  };
  return frame;
}

function fakeEncoder(kind: "video" | "audio"): EncoderLike<VideoEncoderConfig> & {
  encoded: unknown[];
  failFlush?: unknown;
  _captureOutput(output: (chunk: unknown, meta?: unknown) => void): void;
} {
  const state = {
    encoded: [] as unknown[],
    failFlush: undefined as unknown,
    queue: 0,
    closed: false,
    configured: null as unknown,
    output: null as ((chunk: unknown, meta?: unknown) => void) | null,
  };
  const encoder: EncoderLike<VideoEncoderConfig> & {
    encoded: unknown[];
    failFlush?: unknown;
    _captureOutput(output: (chunk: unknown, meta?: unknown) => void): void;
  } = {
    encoded: state.encoded,
    get failFlush() {
      return state.failFlush;
    },
    set failFlush(value: unknown) {
      state.failFlush = value;
    },
    get encodeQueueSize() {
      return state.queue;
    },
    get state() {
      return (state.closed ? "closed" : "configured") as CodecState;
    },
    configure: (config: unknown) => {
      state.configured = config;
    },
    encode: (frame: unknown) => {
      state.encoded.push(frame);
      state.queue += 1;
      state.output?.({ kind, closed: false }, undefined);
    },
    flush: async () => {
      state.queue = 0;
      if (state.failFlush) throw state.failFlush;
    },
    close: () => {
      state.closed = true;
    },
    _captureOutput: (output: (chunk: unknown, meta?: unknown) => void) => {
      state.output = output;
    },
  };
  return encoder;
}

function harness() {
  const posted: FromWorker[] = [];
  let handler: ((message: ToWorker) => void) | null = null;
  const scope: WorkerScope = {
    postMessage: (message: FromWorker) => void posted.push(message),
    setOnMessage: (next: (message: ToWorker) => void) => {
      handler = next;
    },
  };
  const video = fakeEncoder("video");
  const audio = fakeEncoder("audio");
  const chunks: Array<{ kind: string }> = [];
  let finalized = false;
  const muxer: MuxerLike = {
    addVideoChunk: () => void chunks.push({ kind: "video" }),
    addAudioChunk: () => void chunks.push({ kind: "audio" }),
    finalize: () => {
      finalized = true;
    },
    target: { buffer: new ArrayBuffer(8) },
  };
  const deps: WorkerDeps = {
    createMuxer: () => muxer,
    createVideoEncoder: (output) => {
      video._captureOutput(output as (chunk: unknown, meta?: unknown) => void);
      return video as unknown as EncoderLike<VideoEncoderConfig>;
    },
    createAudioEncoder: (output) => {
      audio._captureOutput(output as (chunk: unknown, meta?: unknown) => void);
      return audio as unknown as EncoderLike<AudioEncoderConfig>;
    },
  };
  startWorker(deps, scope);
  const send = (message: ToWorker) => handler!(message);
  return { posted, send, video, audio, chunks, finalized: () => finalized };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("export-worker", () => {
  it("runs init -> frames -> audio -> finish and returns the buffer", async () => {
    const h = harness();
    h.send({ type: "init", voice: true });
    expect(h.posted).toEqual([{ type: "ready" }]);
    const frame = fakeFrame();
    h.send({ type: "frame", frame: frame as unknown as VideoFrame, keyFrame: true });
    expect(frame.closed).toBe(true);
    expect(h.video.encoded.length).toBe(1);
    expect(h.posted.at(-1)).toEqual({ type: "accepted", queue: 1 });
    const data = fakeFrame();
    h.send({ type: "audio", data: data as unknown as AudioData });
    expect(h.audio.encoded.length).toBe(1);
    h.send({ type: "finish" });
    await tick();
    await tick();
    const done = h.posted.at(-1)!;
    expect(done.type).toBe("done");
    // Finish stages are visible so a stall is attributable, not a mystery.
    expect(h.posted).toContainEqual({ type: "stage", stage: "flushing-video" });
    expect(h.posted).toContainEqual({ type: "stage", stage: "finalizing" });
    expect((done as { buffer: ArrayBuffer }).buffer.byteLength).toBe(8);
    expect(h.finalized()).toBe(true);
    expect(h.chunks).toEqual([{ kind: "video" }, { kind: "audio" }]);
  });

  it("forwards encoder dequeue events so a parked main thread can resume", async () => {
    const h = harness();
    h.send({ type: "init", voice: false });
    const ondequeue = (h.video as unknown as { ondequeue?: unknown }).ondequeue;
    expect(typeof ondequeue).toBe("function");
    // Drained queue (1 <= resume threshold): the drain hint fires.
    const frame = fakeFrame();
    h.send({ type: "frame", frame: frame as unknown as VideoFrame, keyFrame: true });
    const before = h.posted.length;
    (ondequeue as () => void)();
    expect(h.posted.length).toBe(before + 1);
    expect(h.posted.at(-1)).toEqual({ type: "accepted", queue: h.video.encodeQueueSize });
    // Backed-up queue: no spam while the encoder is still full; the hint
    // fires again once it drains to the resume threshold.
    for (let i = 0; i < 30; i++) h.send({ type: "frame", frame: fakeFrame() as unknown as VideoFrame, keyFrame: false });
    const parked = h.posted.length;
    (ondequeue as () => void)();
    expect(h.posted.length).toBe(parked);
    await h.video.flush();
    (ondequeue as () => void)();
    expect(h.posted.at(-1)).toEqual({ type: "accepted", queue: 0 });
  });

  it("rejects frames before init instead of throwing", () => {
    const h = harness();
    h.send({ type: "frame", frame: { closed: false } as unknown as VideoFrame, keyFrame: false });
    expect(h.posted.at(-1)).toEqual({ type: "error", message: "Export session is not initialized." });
    expect(h.video.encoded.length).toBe(0);
  });

  it("rejects audio on a voiceless session", () => {
    const h = harness();
    h.send({ type: "init", voice: false });
    h.send({ type: "audio", data: { closed: false } as unknown as AudioData });
    expect(h.posted.at(-1)).toEqual({ type: "error", message: "Audio data sent to a voiceless session." });
  });

  it("surfaces encoder failures on finish", async () => {
    const h = harness();
    h.send({ type: "init", voice: true });
    h.video.failFlush = new Error("encode boom");
    h.send({ type: "finish" });
    await tick();
    await tick();
    expect(h.posted.at(-1)).toEqual({ type: "error", message: "encode boom" });
  });

  it("aborts cleanly mid-session", () => {
    const h = harness();
    h.send({ type: "init", voice: false });
    h.send({ type: "abort" });
    expect(h.posted.at(-1)).toEqual({ type: "aborted" });
    h.send({ type: "frame", frame: { closed: false } as unknown as VideoFrame, keyFrame: false });
    expect(h.posted.at(-1)).toEqual({ type: "error", message: "Export session is not initialized." });
  });

  it("pins the shipping codec configs", () => {
    expect(VIDEO_CONFIG.codec).toBe("avc1.42001f");
    expect([VIDEO_CONFIG.width, VIDEO_CONFIG.height]).toEqual([720, 1280]);
    expect(AUDIO_CONFIG.codec).toBe("mp4a.40.2");
    expect(AUDIO_CONFIG.sampleRate).toBe(44100);
    expect(OPUS_AUDIO_CONFIG.codec).toBe("opus");
    expect(OPUS_AUDIO_CONFIG.sampleRate).toBe(48000);
  });

  it("probes report missing encoders without throwing", async () => {
    // Node has no WebCodecs globals: both probes must fail gracefully.
    expect(await probeVideoConfig()).toEqual({ supported: false, reason: "missing" });
    expect(await probeAudioConfig()).toEqual({ supported: false, reason: "missing" });
    expect(await probeVoiceEncoder()).toEqual({ supported: false, codec: null, reason: "missing" });
    expect(probeMediaRecorder()).toEqual({ supported: false, mimeType: null });
  });

  it("prefers AAC but falls back to Opus", async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const prevEncoder = g["AudioEncoder"];
    const prevData = g["AudioData"];
    try {
      // AAC supported → aac.
      g["AudioData"] = class {};
      g["AudioEncoder"] = { isConfigSupported: async () => ({ supported: true }) };
      expect((await probeVoiceEncoder()).codec).toBe("aac");
      // AAC refused, Opus supported → opus.
      g["AudioEncoder"] = {
        isConfigSupported: async (config: { codec?: string }) =>
          config.codec === "opus" ? { supported: true } : { supported: false },
      };
      const opus = await probeVoiceEncoder();
      expect(opus).toEqual({ supported: true, codec: "opus", reason: null });
      // Neither → unsupported.
      g["AudioEncoder"] = { isConfigSupported: async () => ({ supported: false }) };
      const none = await probeVoiceEncoder();
      expect(none.supported).toBe(false);
      expect(none.codec).toBeNull();
    } finally {
      if (prevEncoder === undefined) delete g["AudioEncoder"];
      else g["AudioEncoder"] = prevEncoder;
      if (prevData === undefined) delete g["AudioData"];
      else g["AudioData"] = prevData;
    }
  });

  it("forwards the opus codec into muxer + encoder config", () => {
    const posted: FromWorker[] = [];
    const seen: Array<{ voice: boolean; codec?: AudioCodec }> = [];
    const configured: unknown[] = [];
    const muxer: MuxerLike = {
      addVideoChunk: () => undefined,
      addAudioChunk: () => undefined,
      finalize: () => undefined,
      target: { buffer: new ArrayBuffer(8) },
    };
    const video = fakeEncoder("video");
    const audio = fakeEncoder("audio");
    const deps: WorkerDeps = {
      createMuxer: (voice: boolean, audioCodec?: AudioCodec) => {
        seen.push({ voice, codec: audioCodec });
        return muxer;
      },
      createVideoEncoder: (output) => {
        video._captureOutput(output as (chunk: unknown, meta?: unknown) => void);
        return video as unknown as EncoderLike<VideoEncoderConfig>;
      },
      createAudioEncoder: (output) => {
        audio._captureOutput(output as (chunk: unknown, meta?: unknown) => void);
        const inner = audio as unknown as EncoderLike<AudioEncoderConfig> & {
          _captureOutput(output: (chunk: unknown, meta?: unknown) => void): void;
        };
        const origConfigure = inner.configure.bind(inner);
        inner.configure = ((config: AudioEncoderConfig) => {
          configured.push(config);
          origConfigure(config);
        }) as typeof inner.configure;
        return inner;
      },
    };
    let handler: ((message: ToWorker) => void) | null = null;
    const scope: WorkerScope = {
      postMessage: (message: FromWorker) => void posted.push(message),
      setOnMessage: (next) => {
        handler = next;
      },
    };
    startWorker(deps, scope);
    handler!({ type: "init", voice: true, audioCodec: "opus" });
    expect(posted).toEqual([{ type: "ready" }]);
    expect(seen).toEqual([{ voice: true, codec: "opus" }]);
    expect(configured).toEqual([{ ...OPUS_AUDIO_CONFIG }]);
    void vi;
  });

  it("answers init via the global scope on the production (no-scope) path", () => {
    // Regression: the handler posted via the injected scope only, so the
    // real-worker path (auto-start, no scope) threw on `init` and the main
    // thread died on the E_ENCODER_INIT timeout.
    const posted: FromWorker[] = [];
    let onmessage: ((event: MessageEvent<ToWorker>) => void) | null = null;
    const stub = {
      postMessage: (message: FromWorker) => void posted.push(message),
      set onmessage(handler: (event: MessageEvent<ToWorker>) => void) { onmessage = handler; },
    };
    const globals = globalThis as Record<string, unknown>;
    const prev = globals.self;
    globals.self = stub;
    try {
      const video = fakeEncoder("video");
      const deps: WorkerDeps = {
        createMuxer: () => ({
          addVideoChunk: () => {},
          addAudioChunk: () => {},
          finalize: () => {},
          target: { buffer: new ArrayBuffer(8) },
        }),
        createVideoEncoder: () => video as unknown as EncoderLike<VideoEncoderConfig>,
        createAudioEncoder: () => fakeEncoder("audio") as unknown as EncoderLike<AudioEncoderConfig>,
      };
      startWorker(deps);
      onmessage!({ data: { type: "init", voice: false } } as MessageEvent<ToWorker>);
      expect(posted).toEqual([{ type: "ready" }]);
    } finally {
      if (prev === undefined) delete globals.self;
      else globals.self = prev;
    }
  });

  it("muxes null-duration video chunks via the raw path with derived durations", () => {
    const rawCalls: Array<{ timestamp: number; duration: number }> = [];
    let videoOutput: ((chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void) | null = null;
    const muxer: MuxerLike = {
      addVideoChunk: () => {
        throw new Error("must not take the throwing path");
      },
      addAudioChunk: () => undefined,
      addVideoChunkRaw: (_data, _type, timestamp, duration) => void rawCalls.push({ timestamp, duration }),
      addAudioChunkRaw: () => undefined,
      finalize: () => undefined,
      target: { buffer: new ArrayBuffer(8) },
    };
    const video = fakeEncoder("video");
    const deps: WorkerDeps = {
      createMuxer: () => muxer,
      createVideoEncoder: (output) => {
        videoOutput = output;
        return video as unknown as EncoderLike<VideoEncoderConfig>;
      },
      createAudioEncoder: (output) => {
        void output;
        return fakeEncoder("audio") as unknown as EncoderLike<AudioEncoderConfig>;
      },
    };
    let handler: ((message: ToWorker) => void) | null = null;
    const scope: WorkerScope = {
      postMessage: () => undefined,
      setOnMessage: (next) => {
        handler = next;
      },
    };
    startWorker(deps, scope);
    handler!({ type: "init", voice: false });
    const nullChunk = (timestamp: number) => ({
      byteLength: 4,
      type: "delta",
      timestamp,
      duration: null,
      copyTo: (dest: Uint8Array) => dest.fill(1),
    });
    videoOutput!(nullChunk(0) as unknown as EncodedVideoChunk, undefined);
    videoOutput!(nullChunk(VIDEO_FRAME_DURATION_US) as unknown as EncodedVideoChunk, undefined);
    expect(rawCalls).toEqual([
      { timestamp: 0, duration: VIDEO_FRAME_DURATION_US },
      { timestamp: VIDEO_FRAME_DURATION_US, duration: VIDEO_FRAME_DURATION_US },
    ]);
  });

  it("muxes null-duration audio chunks with the nominal codec frame duration", () => {
    const rawCalls: Array<{ timestamp: number; duration: number }> = [];
    let audioOutput: ((chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void) | null = null;
    const muxer: MuxerLike = {
      addVideoChunk: () => undefined,
      addAudioChunk: () => {
        throw new Error("must not take the throwing path");
      },
      addVideoChunkRaw: () => undefined,
      addAudioChunkRaw: (_data, _type, timestamp, duration) => void rawCalls.push({ timestamp, duration }),
      finalize: () => undefined,
      target: { buffer: new ArrayBuffer(8) },
    };
    const audio = fakeEncoder("audio");
    const deps: WorkerDeps = {
      createMuxer: () => muxer,
      createVideoEncoder: (output) => {
        void output;
        return fakeEncoder("video") as unknown as EncoderLike<VideoEncoderConfig>;
      },
      createAudioEncoder: (output) => {
        audioOutput = output;
        return audio as unknown as EncoderLike<AudioEncoderConfig>;
      },
    };
    let handler: ((message: ToWorker) => void) | null = null;
    const scope: WorkerScope = {
      postMessage: () => undefined,
      setOnMessage: (next) => {
        handler = next;
      },
    };
    startWorker(deps, scope);
    handler!({ type: "init", voice: true });
    const nullChunk = (timestamp: number) => ({
      byteLength: 8,
      type: "key",
      timestamp,
      duration: null,
      copyTo: (dest: Uint8Array) => dest.fill(2),
    });
    audioOutput!(nullChunk(0) as unknown as EncodedAudioChunk, undefined);
    audioOutput!(nullChunk(AAC_FRAME_DURATION_US) as unknown as EncodedAudioChunk, undefined);
    expect(rawCalls).toEqual([
      { timestamp: 0, duration: AAC_FRAME_DURATION_US },
      { timestamp: AAC_FRAME_DURATION_US, duration: AAC_FRAME_DURATION_US },
    ]);
  });

  it("keeps the normal mux path when chunk durations are present", () => {
    const normalCalls: unknown[] = [];
    const rawCalls: unknown[] = [];
    let videoOutput: ((chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void) | null = null;
    const muxer: MuxerLike = {
      addVideoChunk: (chunk) => void normalCalls.push(chunk),
      addAudioChunk: () => undefined,
      addVideoChunkRaw: (...args: unknown[]) => void rawCalls.push(args),
      finalize: () => undefined,
      target: { buffer: new ArrayBuffer(8) },
    };
    const video = fakeEncoder("video");
    const deps: WorkerDeps = {
      createMuxer: () => muxer,
      createVideoEncoder: (output) => {
        videoOutput = output;
        return video as unknown as EncoderLike<VideoEncoderConfig>;
      },
      createAudioEncoder: (output) => {
        void output;
        return fakeEncoder("audio") as unknown as EncoderLike<AudioEncoderConfig>;
      },
    };
    let handler: ((message: ToWorker) => void) | null = null;
    const scope: WorkerScope = {
      postMessage: () => undefined,
      setOnMessage: (next) => {
        handler = next;
      },
    };
    startWorker(deps, scope);
    handler!({ type: "init", voice: false });
    videoOutput!({ duration: 33333 } as EncodedVideoChunk, undefined);
    expect(normalCalls.length).toBe(1);
    expect(rawCalls.length).toBe(0);
  });

  it("routes NaN/negative durations to the raw path too", () => {
    const rawCalls: Array<{ duration: number }> = [];
    let videoOutput: ((chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void) | null = null;
    const muxer: MuxerLike = {
      addVideoChunk: () => {
        throw new Error("must not take the throwing path");
      },
      addAudioChunk: () => undefined,
      addVideoChunkRaw: (_data, _type, _timestamp, duration) => void rawCalls.push({ duration }),
      finalize: () => undefined,
      target: { buffer: new ArrayBuffer(8) },
    };
    const video = fakeEncoder("video");
    const deps: WorkerDeps = {
      createMuxer: () => muxer,
      createVideoEncoder: (output) => {
        videoOutput = output;
        return video as unknown as EncoderLike<VideoEncoderConfig>;
      },
      createAudioEncoder: (output) => {
        void output;
        return fakeEncoder("audio") as unknown as EncoderLike<AudioEncoderConfig>;
      },
    };
    let handler: ((message: ToWorker) => void) | null = null;
    const scope: WorkerScope = {
      postMessage: () => undefined,
      setOnMessage: (next) => {
        handler = next;
      },
    };
    startWorker(deps, scope);
    handler!({ type: "init", voice: false });
    const badChunk = (duration: number) => ({
      byteLength: 4,
      type: "delta",
      timestamp: 0,
      duration,
      copyTo: (dest: Uint8Array) => dest.fill(1),
    });
    videoOutput!(badChunk(Number.NaN) as unknown as EncodedVideoChunk, undefined);
    videoOutput!(badChunk(-5) as unknown as EncodedVideoChunk, undefined);
    expect(rawCalls).toEqual([{ duration: VIDEO_FRAME_DURATION_US }, { duration: VIDEO_FRAME_DURATION_US }]);
  });
});
