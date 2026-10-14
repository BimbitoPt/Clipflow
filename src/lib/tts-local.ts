import type { TtsLoader } from "./tts";
import { desktop } from "./desktop";
import { DEFAULT_VOICE, KOKORO_MODEL_ID, KOKORO_SAMPLE_RATE } from "./kokoro-contract";
import type { TtsSynthResponse } from "./tts-worker";

// Re-exported so existing importers (tts-timed.ts, tts-local.test.ts) keep working.
export { DEFAULT_VOICE, KOKORO_SAMPLE_RATE, MODEL_REVISION } from "./kokoro-contract";

/**
 * Kokoro 82M (Apache-2.0) synthesis runs in tts-worker.ts, off the main
 * thread — 45 s of CPU inference takes minutes and must never freeze the
 * editor tab. Model weights stage into public/models via
 * `npm run model:install` (pinned revision, see kokoro-contract.ts);
 * synthesis runs fully offline from /models.
 */

interface PendingSynth {
  resolve: (result: { audio: Float32Array; samplingRate: number }) => void;
  reject: (error: Error) => void;
}

let synthWorker: Worker | null = null;
let nextSynthId = 1;
const pendingSynths = new Map<number, PendingSynth>();

function failAllPending(message: string): void {
  const entries = [...pendingSynths.entries()];
  pendingSynths.clear();
  for (const [, pending] of entries) pending.reject(new Error(message));
}

/** Lazily-created synthesis worker. The model loads on first synthesis. */
function getSynthWorker(): Worker {
  if (!synthWorker) {
    const created = new Worker(new URL("./tts-worker.ts", import.meta.url), { type: "module" });
    created.onmessage = (event: MessageEvent<TtsSynthResponse>) => {
      const response = event.data;
      const pending = pendingSynths.get(response.id);
      if (!pending) return;
      pendingSynths.delete(response.id);
      if (response.ok) {
        pending.resolve({ audio: new Float32Array(response.audio), samplingRate: response.samplingRate });
      } else {
        pending.reject(new Error(`E_TTS_MODEL: ${response.error} — if the model is missing run \`npm run model:install\`.`));
      }
    };
    created.onerror = () => {
      // Drop the dead worker so the next synthesis starts a fresh one
      // instead of sticking to rejection.
      synthWorker = null;
      failAllPending("E_TTS_MODEL: synthesis worker crashed — export again to retry.");
    };
    synthWorker = created;
  }
  return synthWorker;
}

function synthesizeInWorker(text: string): Promise<{ audio: Float32Array; samplingRate: number }> {
  return new Promise((resolve, reject) => {
    try {
      const worker = getSynthWorker();
      const id = nextSynthId++;
      pendingSynths.set(id, { resolve, reject });
      worker.postMessage({ id, text, voice: DEFAULT_VOICE, desktop });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/** Local-readiness probe for the voice stack. Never throws. */
export interface VoiceAssetStatus {
  ready: boolean;
  /** Required local files that are missing or unreachable. */
  missing: string[];
}

interface RequiredVoiceAsset {
  label: string;
  url: string;
  /** The voice GET also warms the HTTP cache used by seedVoiceCache. */
  warm?: boolean;
}

const REQUIRED_VOICE_ASSETS: RequiredVoiceAsset[] = [
  { label: "model config", url: `/models/${KOKORO_MODEL_ID}/config.json` },
  { label: "model tokenizer", url: `/models/${KOKORO_MODEL_ID}/tokenizer.json` },
  { label: "model tokenizer config", url: `/models/${KOKORO_MODEL_ID}/tokenizer_config.json` },
  { label: "model weights", url: `/models/${KOKORO_MODEL_ID}/onnx/model_quantized.onnx` },
  { label: "ONNX runtime WASM", url: "/ort/ort-wasm-simd-threaded.jsep.wasm" },
  { label: "ONNX runtime module", url: "/ort/ort-wasm-simd-threaded.jsep.mjs" },
  { label: "voice", url: `/models/voices/${DEFAULT_VOICE}.bin`, warm: true },
];

/**
 * Check the actual standard synthesis dependencies before importing the
 * heavyweight model. HEAD checks existence without downloading the ~92 MB
 * ONNX weights; the voice uses GET so its bytes warm the HTTP cache consumed
 * by seedVoiceCache in the synthesis worker. The timestamped model is
 * deliberately optional because export can fall back to the standard Kokoro
 * checkpoint.
 */
export async function checkVoiceAssets(): Promise<VoiceAssetStatus> {
  const results = await Promise.all(REQUIRED_VOICE_ASSETS.map(async (asset) => {
    try {
      const response = await fetch(asset.url, { method: asset.warm ? "GET" : "HEAD" });
      if (!response.ok) return asset.label;
      if (asset.warm) {
        // Consume the voice body so the request completes before cache seeding.
        // Best-effort: a body-read failure must not fail preflight when the
        // asset itself exists (seedVoiceCache refetches anyway).
        await response.arrayBuffer().catch(() => {});
      }
      return null;
    } catch {
      return asset.label;
    }
  }));
  return { ready: results.every((result) => result === null), missing: results.filter((result): result is string => result !== null) };
}

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

export function createKokoroLoader(): TtsLoader {
  return async (text: string): Promise<Float32Array> => {
    try {
      const { audio, samplingRate } = await synthesizeInWorker(text);
      if (samplingRate !== KOKORO_SAMPLE_RATE) {
        return resampleLinear(audio, samplingRate, KOKORO_SAMPLE_RATE);
      }
      // Defensive copy: callers must not be able to mutate the transferred
      // buffer through the returned view.
      return audio.slice();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        message.startsWith("E_TTS_MODEL:")
          ? message
          : "E_TTS_MODEL: " + message + " — if the model is missing run `npm run model:install`.",
        { cause: err },
      );
    }
  };
}
