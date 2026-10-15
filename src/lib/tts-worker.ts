import { KOKORO_MODEL_ID } from "./kokoro-contract";
import type { KokoroTTS } from "kokoro-js";

/** Voice ids shipped with the pinned Kokoro checkpoint. */
type KokoroVoiceId = NonNullable<NonNullable<Parameters<KokoroTTS["generate"]>[1]>["voice"]>;

/**
 * Kokoro synthesis worker: model load + inference live here, off the main
 * thread. Synthesizing 45 s of audio on CPU takes minutes — run inline, it
 * freezes the editor tab (page stops responding until generate() returns).
 * Same local-only model contract as the old inline path (pinned revision,
 * /models, no remote fetches) — only the thread changed.
 *
 * Protocol (main -> worker): { id, text, voice, desktop }.
 * Protocol (worker -> main): { id, ok: true, audio, samplingRate } |
 * { id, ok: false, error }. Nothing here ever throws out of the handler —
 * failures arrive as ok:false so the main thread fails the export cleanly.
 */

export interface TtsSynthRequest {
  id: number;
  text: string;
  voice: KokoroVoiceId;
  desktop: boolean;
}

export type TtsSynthResponse =
  | { id: number; ok: true; audio: ArrayBuffer; samplingRate: number }
  | { id: number; ok: false; error: string };

export interface TtsSynthEngine {
  synthesize(text: string, voice: KokoroVoiceId): Promise<{ audio: Float32Array; samplingRate: number }>;
}

export interface TtsWorkerScope {
  postMessage(message: TtsSynthResponse, transfer?: Transferable[]): void;
  setOnMessage(handler: (message: TtsSynthRequest) => void): void;
}

export type TtsEngineLoader = (opts: { voice: string; desktop: boolean }) => Promise<TtsSynthEngine>;

// kokoro-js loads voice bins from huggingface's mutable `main` ref when its
// CacheStorage entry is missing — that runtime fetch is what got rate-limited
// before. Pre-seed the exact cache key kokoro-js checks from our own
// /models/voices copy so synthesis never leaves the origin.
const VOICE_CACHE = "kokoro-voices";
const voiceCdnUrl = (voice: string) =>
  `https://huggingface.co/${KOKORO_MODEL_ID}/resolve/main/voices/${voice}.bin`;

async function seedVoiceCache(voice: string): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(VOICE_CACHE);
    const key = voiceCdnUrl(voice);
    if (await cache.match(key)) return;
    const local = await fetch(`/models/voices/${voice}.bin`);
    if (!local.ok) return; // Let kokoro-js fall back to its own fetch.
    await cache.put(key, new Response(await local.arrayBuffer(), { headers: { "Content-Type": "application/octet-stream" } }));
  } catch {
    // Cache seeding is best-effort; synthesis falls back to upstream.
  }
}

async function loadRealEngine(opts: { voice: string; desktop: boolean }): Promise<TtsSynthEngine> {
  // LAZY import: module import must never touch network or the main bundle.
  const [{ KokoroTTS }, { env }] = await Promise.all([
    import("kokoro-js"),
    import("@huggingface/transformers"),
  ]);
  // Local-only: weights live in /models (web: public/models, desktop:
  // staged by prepare-desktop). A missing model must fail with a named
  // error, never silently download at export time.
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = "/models/";
  // wasm config is always initialized by transformers at module load.
  const wasm = env.backends.onnx.wasm!;
  if (opts.desktop || typeof document === "undefined") wasm.numThreads = 1;
  await seedVoiceCache(opts.voice);
  const synth = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: "q8" });
  return {
    synthesize: async (text: string, voice: KokoroVoiceId) => {
      const out = await synth.generate(text, { voice });
      return { audio: out.audio, samplingRate: out.sampling_rate };
    },
  };
}

export function startTtsWorker(loadEngine: TtsEngineLoader = loadRealEngine, scope?: TtsWorkerScope): void {
  let engine: TtsSynthEngine | null = null;

  // Production channel (real worker global) when tests haven't injected a
  // scope. Resolved up front so the handler posts to one channel on both
  // paths — posting via the injected scope alone leaves the production
  // handler with undefined and the worker never answers.
  const globalScope = scope ? null : (self as unknown as {
    postMessage(message: TtsSynthResponse, transfer?: Transferable[]): void;
    onmessage: ((event: MessageEvent<TtsSynthRequest>) => void) | null;
  });
  const post = (message: TtsSynthResponse, transfer?: Transferable[]) =>
    (scope ?? globalScope)!.postMessage(message, transfer);

  const handle = (message: TtsSynthRequest) => {
    void (async () => {
      try {
        engine ??= await loadEngine({ voice: message.voice, desktop: message.desktop });
        const { audio, samplingRate } = await engine.synthesize(message.text, message.voice);
        // Defensive copy: the engine may hand back a view over a reused
        // buffer, and postMessage transfer neuters the source.
        const buffer = audio.slice().buffer as ArrayBuffer;
        post({ id: message.id, ok: true, audio: buffer, samplingRate }, [buffer]);
      } catch (error) {
        post({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
  };

  if (scope) {
    scope.setOnMessage(handle);
    return;
  }
  globalScope!.onmessage = (event: MessageEvent<TtsSynthRequest>) => handle(event.data);
}

// Auto-start in a real worker global only: main-thread `self` is `window`.
try {
  const candidate = self as unknown as { window?: unknown };
  if (typeof self !== "undefined" && candidate.window === undefined) startTtsWorker();
} catch {
  // Module import context (tests, SSR): start explicitly via startTtsWorker().
}
