import type { TtsLoader } from "./tts";

const MODEL_ID = "Xenova/speecht5_tts";
// Default speaker voice (float32 mono embeddings). Passed as URL string so the
// pipeline fetches it lazily on first synthesis — never at import/factory time.
// Source: @xenova/transformers@2.17.2 src/pipelines.js TextToAudioPipeline docs
// (speaker_embeddings: Tensor | Float32Array | string | URL).
// NOTE: first synthesis needs network — the model weights AND the
// speaker_embeddings URL below (pinned to a mutable `main` ref on
// huggingface.co). Offline reuse works only if the browser HTTP cache has
// retained both artifacts from a previous run.
const SPEAKER_EMBEDDINGS_URL =
  "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

const TARGET_SAMPLE_RATE = 16000;

type SpeechT5Pipeline = (
  text: string,
  options: { speaker_embeddings: string },
) => Promise<{ audio: Float32Array; sampling_rate: number }>;

let cached: SpeechT5Pipeline | null = null;
// Promise memoization: concurrent loader() calls share one init. Reset to
// null on failure so a later call retries instead of sticking to rejection.
let pending: Promise<SpeechT5Pipeline> | null = null;

function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
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

async function getOrCreatePipeline(): Promise<SpeechT5Pipeline> {
  if (cached) return cached;
  if (pending) return pending;
  pending = (async (): Promise<SpeechT5Pipeline> => {
    try {
      // LAZY import: module import must never touch network.
      const { pipeline } = await import("@xenova/transformers");
      const created = (await pipeline(
        "text-to-speech",
        MODEL_ID,
      )) as unknown as SpeechT5Pipeline;
      cached = created;
      return created;
    } catch (err) {
      pending = null;
      throw err;
    }
  })();
  return pending;
}

export function createSpeechT5Loader(): TtsLoader {
  return async (text: string): Promise<Float32Array> => {
    try {
      const synth = await getOrCreatePipeline();
      // Output shape in @xenova/transformers@2.17.2: { audio: Float32Array, sampling_rate: number }
      // (see TextToAudioPipeline._call_text_to_spectrogram returning { audio: waveform.data, sampling_rate }).
      const out = await synth(text, {
        speaker_embeddings: SPEAKER_EMBEDDINGS_URL,
      });
      const audio = out.audio;
      if (out.sampling_rate !== TARGET_SAMPLE_RATE) {
        return resampleLinear(audio, out.sampling_rate, TARGET_SAMPLE_RATE);
      }
      // Defensive copy: callers must not be able to mutate the cached
      // pipeline's backing buffer through the returned view.
      return audio.slice();
    } catch (err) {
      throw new Error("E_TTS_MODEL: " + (err as Error).message, {
        cause: err,
      });
    }
  };
}
