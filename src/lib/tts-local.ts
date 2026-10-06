import type { TtsLoader } from "./tts";
import { desktop } from "./desktop";

/**
 * Kokoro 82M (Apache-2.0) — the same free local model the batch studio
 * ships. Replaces SpeechT5, which needed a runtime huggingface.co fetch for
 * a speaker-embedding file pinned to a mutable `main` ref (rate-limited us)
 * and sounded robotic anyway. Kokoro ships voice bins inside the npm package
 * and never needs speaker embeddings — style comes from the voice id.
 *
 * Model weights stage into public/models via `npm run model:install`
 * (pinned revision); synthesis runs fully offline from /models.
 */
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** Kokoro's native output rate. Both export paths resample from here. */
export const KOKORO_SAMPLE_RATE = 24000;
/** Clipflow brand voice — matches remotion-studio's Clipflow default. */
export const DEFAULT_VOICE = "af_heart" as const;

// kokoro-js loads voice bins from huggingface's mutable `main` ref when its
// CacheStorage entry is missing — that runtime fetch is what got rate-limited
// before. We pre-seed the exact cache key kokoro-js checks from our own
// /models/voices copy so synthesis never leaves the origin.
const VOICE_CACHE = "kokoro-voices";
const voiceCdnUrl = (voice: string) =>
  `https://huggingface.co/${MODEL_ID}/resolve/main/voices/${voice}.bin`;

type KokoroInstance = Awaited<ReturnType<typeof import("kokoro-js").KokoroTTS.from_pretrained>>;

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

let cached: KokoroInstance | null = null;
// Promise memoization: concurrent loader() calls share one init. Reset to
// null on failure so a later call retries instead of sticking to rejection.
let pending: Promise<KokoroInstance> | null = null;

export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (input.length === 0 || fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

async function getOrCreatePipeline(): Promise<KokoroInstance> {
  if (cached) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
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
      if (desktop) wasm.numThreads = 1;
      await seedVoiceCache(DEFAULT_VOICE);
      const created = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8" });
      cached = created;
      return created;
    } catch (err) {
      pending = null;
      throw err;
    }
  })();
  return pending;
}

export function createKokoroLoader(): TtsLoader {
  return async (text: string): Promise<Float32Array> => {
    try {
      const synth = await getOrCreatePipeline();
      const out = await synth.generate(text, { voice: DEFAULT_VOICE });
      const audio = out.audio;
      if (out.sampling_rate !== KOKORO_SAMPLE_RATE) {
        return resampleLinear(audio, out.sampling_rate, KOKORO_SAMPLE_RATE);
      }
      // Defensive copy: callers must not be able to mutate the cached
      // model's backing buffer through the returned view.
      return audio.slice();
    } catch (err) {
      throw new Error(
        "E_TTS_MODEL: " + (err as Error).message +
          " — if the model is missing run `npm run model:install`.",
        { cause: err },
      );
    }
  };
}

