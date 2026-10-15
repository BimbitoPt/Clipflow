import { splitToken, wordSpansFromDurations, type PhonemeGroup } from "../../shared/word-align";
import { alignCueWordTimings, type TimedCueTiming } from "./planner";
import { desktop } from "./desktop";
import { DEFAULT_VOICE, KOKORO_SAMPLE_RATE } from "./tts-local";

/**
 * Timed Kokoro for the PWA: one pass yields audio AND model-predicted word
 * spans, replacing the planner's even-split captions with real timings when
 * the export synthesizes its voice locally.
 *
 * Uses onnx-community/Kokoro-82M-v1.0-ONNX-timestamped — the standard
 * checkpoint re-exported with a per-token duration head. Driven directly
 * (tokenizer + model) instead of kokoro-js's generate(), which discards the
 * duration output; loading mirrors tts-local's rules (local-only weights,
 * lazy imports, q8). Alignment is per-word phonemization via the shared
 * word-align module — the same code the remotion-studio pipeline uses.
 *
 * The standard model stays the fallback (createKokoroLoader) so export never
 * gets worse than before — this module only ever upgrades captions.
 */
const TIMESTAMPED_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX-timestamped";
/**
 * Pinned timestamped-weights revision — must match TS_REVISION in
 * scripts/install-kokoro-model.mjs (enforced by tts-local.test.ts). The
 * timed path is a soft upgrade over the standard model (export falls back
 * when it is unavailable), so this only pins the manifest, not availability.
 */
export const TIMESTAMPED_MODEL_REVISION = "dd4401a9add81ac692d20e240d22ec9dda82cc29";

export interface TimedSynthesis {
  audio: Float32Array;
  samplingRate: number;
  /** Per-cue spans/word times in audio seconds — voice starts at video t=0, so these are video seconds. */
  cues: Array<TimedCueTiming | null>;
}

type TimedSynth = (cueTexts: string[]) => Promise<TimedSynthesis>;

let cached: TimedSynth | null = null;
// Promise memoization: concurrent calls share one init; reset to null on
// failure so a later call retries instead of sticking to rejection.
let pending: Promise<TimedSynth> | null = null;

export function createKokoroTimedLoaderInline(): TimedSynth {
  return (cueTexts: string[]) => getOrCreateTimedSynth().then((synth) => synth(cueTexts));
}

async function getOrCreateTimedSynth(): Promise<TimedSynth> {
  if (cached) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      // LAZY imports: module import must never touch network or the main bundle.
      const [{ KokoroTTS }, { env, Tensor }, { phonemize }] = await Promise.all([
        import("kokoro-js"),
        import("@huggingface/transformers"),
        import("phonemizer"),
      ]);
      // Local-only: weights live in /models (web: public/models, desktop:
      // staged by prepare-desktop). A missing model must fail with a named
      // error, never silently download at export time.
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = "/models/";
      // wasm config is always initialized by transformers at module load.
      const wasm = env.backends.onnx.wasm!;
      if (desktop || typeof document === "undefined") wasm.numThreads = 1;
      const tts = await KokoroTTS.from_pretrained(TIMESTAMPED_MODEL_ID, { dtype: "q8" });

      // The tokenizer has no <unk>: unknown chars are silently dropped, which
      // would desync every later duration. Filter phoneme chars against the
      // real vocab read from the staged tokenizer.json.
      const vocabResponse = await fetch(`/models/${TIMESTAMPED_MODEL_ID}/tokenizer.json`);
      if (!vocabResponse.ok) throw new Error(`E_TOKENIZER_FETCH: ${vocabResponse.status}`);
      const vocabJson = (await vocabResponse.json()) as { model: { vocab: Record<string, number> } };
      const vocab = new Set(Object.keys(vocabJson.model.vocab));

      const voices = new Map<string, Float32Array>();
      const loadVoice = async (voice: string): Promise<Float32Array> => {
        const cachedVoice = voices.get(voice);
        if (cachedVoice) return cachedVoice;
        const response = await fetch(`/models/voices/${voice}.bin`);
        if (!response.ok) throw new Error(`E_VOICE_FETCH: ${response.status}`);
        // fetch yields an ArrayBuffer, so this reinterprets bytes as floats
        // (never copy the byte *values* the way Float32Array(uint8array) would).
        const vector = new Float32Array(await response.arrayBuffer());
        voices.set(voice, vector);
        return vector;
      };

      const phonemeCache = new Map<string, string>();
      // espeak language mirrors kokoro-js: "a*" voices are American.
      const language = DEFAULT_VOICE.startsWith("a") ? "en-us" : "en";
      const phonemizeCore = async (core: string): Promise<string> => {
        const key = `${language}\0${core}`;
        const cachedPhonemes = phonemeCache.get(key);
        if (cachedPhonemes !== undefined) return cachedPhonemes;
        const spoken = (await phonemize(core, language)).join(" ");
        phonemeCache.set(key, spoken);
        return spoken;
      };

      return async (cueTexts: string[]): Promise<TimedSynthesis> => {
        const words = cueTexts.flatMap((text) => text.trim().split(/\s+/).filter(Boolean));
        if (!words.length) throw new Error("E_EMPTY_TEXT: nothing to synthesize");
        const groups: PhonemeGroup[] = [];
        for (const word of words) {
          const { lead, core, trail } = splitToken(word);
          const spoken = core ? await phonemizeCore(core) : "";
          const phonemes = [...(lead + spoken + trail)].filter((ch) => vocab.has(ch)).join("");
          groups.push({ word, phonemes });
        }
        const flat = groups.filter((group) => group.phonemes).map((group) => group.phonemes).join(" ");
        const { input_ids } = tts.tokenizer(flat, { truncation: true });
        const voice = await loadVoice(DEFAULT_VOICE);
        const offset = 256 * Math.min(Math.max((input_ids.dims.at(-1) ?? 2) - 2, 0), 509);
        const style = new Tensor("float32", voice.slice(offset, offset + 256), [1, 256]);
        const speed = new Tensor("float32", [1], [1]);
        const output = (await tts.model({ input_ids, style, speed })) as {
          waveform?: { data: Float32Array };
          durations?: { data: Float32Array };
        };
        const waveform = output.waveform?.data;
        const durations = output.durations?.data;
        if (!waveform?.length || !durations) {
          throw new Error("E_NO_TIMINGS: timestamped Kokoro export did not return waveform + durations");
        }
        // Defensive copy: callers must not mutate the model's backing buffer.
        const audio = waveform.slice();
        const spans = wordSpansFromDurations(groups, durations, audio.length / KOKORO_SAMPLE_RATE);
        return { audio, samplingRate: KOKORO_SAMPLE_RATE, cues: alignCueWordTimings(cueTexts, spans) };
      };
    } catch (err) {
      pending = null;
      throw err;
    }
  })();
  return pending;
}
