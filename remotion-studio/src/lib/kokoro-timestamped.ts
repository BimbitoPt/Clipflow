import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { VoiceId, WordTiming } from "./domain";
import { splitToken, wordSpansFromDurations, type PhonemeGroup } from "../../../shared/word-align";

/**
 * Timed Kokoro synthesis: one pass yields audio AND model-predicted word spans.
 *
 * Uses onnx-community/Kokoro-82M-v1.0-ONNX-timestamped — the identical
 * checkpoint re-exported with a per-token duration head (`durations` output
 * next to `waveform`). We drive the model directly instead of kokoro-js's
 * `generate()`, which discards the duration output, replicating its exact
 * loading path (same tokenizer, same style-vector row selection) so audio
 * stays interchangeable with the standard export.
 *
 * Alignment works by construction: each script word is phonemized on its own
 * (espeak, per-word like misaki — Kokoro's training G2P) and the tokenizer
 * consumes one id per phoneme character, so word→duration mapping is exact
 * rather than guessed. Punctuation keeps its own tokens (the model was trained
 * with them). Frames rescale onto the measured audio length in word-align.
 *
 * Known deviation from the production path: full-sentence espeak performs
 * cross-word reductions ("at a" → [æɾə]); per-word phonemization loses those,
 * trading a little coarticulation for exact caption alignment.
 */
export const TIMESTAMPED_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX-timestamped";
/** Kokoro's native output rate (matches kokoro-js RawAudio). */
const KOKORO_SAMPLE_RATE = 24000;

export type TimedSynthesizedVoice = {
  audio: Float32Array;
  samplingRate: number;
  wordTimings: WordTiming[];
};

type TimedSynth = (text: string, voiceId: VoiceId) => Promise<TimedSynthesizedVoice>;

let synthPromise: Promise<TimedSynth> | null = null;

/** espeak language for a voice id: "a*" = American, everything else British. */
function espeakLanguageForVoice(voiceId: string): "en-us" | "en" {
  return voiceId.startsWith("a") ? "en-us" : "en";
}

export function getTimedSynth(): Promise<TimedSynth> {
  if (!synthPromise) {
    synthPromise = (async () => {
      const requirePackage = createRequire(import.meta.url);
      const { env, Tensor } = requirePackage("@huggingface/transformers") as typeof import("@huggingface/transformers");
      const { KokoroTTS } = requirePackage("kokoro-js") as typeof import("kokoro-js");
      const { phonemize } = requirePackage("phonemizer") as typeof import("phonemizer");
      const localModelPath = path.resolve(process.cwd(), "..", "public", "models");
      env.localModelPath = localModelPath;
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      const tts = await KokoroTTS.from_pretrained(TIMESTAMPED_MODEL_ID, { dtype: "q8", device: "cpu" });

      // The tokenizer has no <unk>: unknown chars are silently dropped, which
      // would desync every later duration. Filter phoneme chars against the
      // real vocab read from the staged tokenizer.json.
      const tokenizerPath = path.join(localModelPath, ...TIMESTAMPED_MODEL_ID.split("/"), "tokenizer.json");
      const vocab = new Set(Object.keys((JSON.parse(await readFile(tokenizerPath, "utf8")) as { model: { vocab: Record<string, number> } }).model.vocab));

      const voiceDir = path.join(path.dirname(requirePackage.resolve("kokoro-js")), "..", "voices");
      const voices = new Map<VoiceId, Float32Array>();
      const loadVoice = async (voiceId: VoiceId): Promise<Float32Array> => {
        const cached = voices.get(voiceId);
        if (cached) return cached;
        const bin = await readFile(path.join(voiceDir, `${voiceId}.bin`));
        // Reinterpret the raw bytes — `new Float32Array(buffer)` on a Node
        // Buffer would copy byte *values* and corrupt the style vector.
        const voice = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / Float32Array.BYTES_PER_ELEMENT);
        voices.set(voiceId, voice);
        return voice;
      };

      const phonemeCache = new Map<string, string>();
      const phonemizeCore = async (core: string, language: "en-us" | "en"): Promise<string> => {
        const key = `${language}\0${core}`;
        const cached = phonemeCache.get(key);
        if (cached !== undefined) return cached;
        const spoken = (await phonemize(core, language)).join(" ");
        phonemeCache.set(key, spoken);
        return spoken;
      };

      return async (text: string, voiceId: VoiceId): Promise<TimedSynthesizedVoice> => {
        const words = text.trim().split(/\s+/).filter(Boolean);
        if (!words.length) throw new Error("E_EMPTY_TEXT: nothing to synthesize");
        const language = espeakLanguageForVoice(voiceId);
        const groups: PhonemeGroup[] = [];
        for (const word of words) {
          const { lead, core, trail } = splitToken(word);
          const spoken = core ? await phonemizeCore(core, language) : "";
          const phonemes = [...(lead + spoken + trail)].filter((ch) => vocab.has(ch)).join("");
          groups.push({ word, phonemes });
        }
        const flat = groups.filter((group) => group.phonemes).map((group) => group.phonemes).join(" ");
        const { input_ids } = tts.tokenizer(flat, { truncation: true });
        const voice = await loadVoice(voiceId);
        const offset = 256 * Math.min(Math.max((input_ids.dims.at(-1) ?? 2) - 2, 0), 509);
        const style = new Tensor("float32", voice.slice(offset, offset + 256), [1, 256]);
        const speed = new Tensor("float32", [1], [1]);
        const output = (await tts.model({ input_ids, style, speed })) as { waveform?: { data: Float32Array }; durations?: { data: Float32Array } };
        const audio = output.waveform?.data;
        const durations = output.durations?.data;
        if (!audio?.length || !durations) throw new Error("E_NO_TIMINGS: timestamped Kokoro export did not return waveform + durations");
        const wordTimings = wordSpansFromDurations(groups, durations, audio.length / KOKORO_SAMPLE_RATE);
        return { audio, samplingRate: KOKORO_SAMPLE_RATE, wordTimings };
      };
    })().catch((error) => {
      synthPromise = null;
      throw error;
    });
  }
  return synthPromise;
}
