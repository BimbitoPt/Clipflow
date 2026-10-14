import { describe, expect, it } from "vitest";
import {
  AUDIO_CONFIG,
  probeAudioConfig,
  probeVideoConfig,
  VIDEO_CONFIG,
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

  it("forwards encoder dequeue events so a parked main thread can resume", () => {
    const h = harness();
    h.send({ type: "init", voice: false });
    const ondequeue = (h.video as unknown as { ondequeue?: unknown }).ondequeue;
    expect(typeof ondequeue).toBe("function");
    const before = h.posted.length;
    (ondequeue as () => void)();
    expect(h.posted.length).toBe(before + 1);
    expect(h.posted.at(-1)).toEqual({ type: "accepted", queue: h.video.encodeQueueSize });
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
  });

  it("probes report missing encoders without throwing", async () => {
    // Node has no WebCodecs globals: both probes must fail gracefully.
    expect(await probeVideoConfig()).toEqual({ supported: false, reason: "missing" });
    expect(await probeAudioConfig()).toEqual({ supported: false, reason: "missing" });
  });
});
