import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { getTimedSynth } from "./kokoro-timestamped";
import { VoiceIdSchema, type VoiceId, type WordTiming } from "./domain";

export type SynthesizedVoice = { audio: Float32Array; samplingRate: number; wordTimings?: WordTiming[] };
type Synth = (text: string, voiceId: VoiceId) => Promise<SynthesizedVoice>;

let synthPromise: Promise<Synth> | null = null;

function getSynth(): Promise<Synth> {
  if (!synthPromise) {
    synthPromise = (async () => {
      const requirePackage = createRequire(import.meta.url);
      const { env } = requirePackage("@huggingface/transformers") as typeof import("@huggingface/transformers");
      const { KokoroTTS } = requirePackage("kokoro-js") as typeof import("kokoro-js");
      env.localModelPath = path.resolve(process.cwd(), "..", "public", "models");
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
      return async (text: string, voiceId: VoiceId) => {
        const result = await tts.generate(text, { voice: voiceId });
        return { audio: result.audio, samplingRate: result.sampling_rate };
      };
    })().catch((error) => {
      synthPromise = null;
      throw error;
    });
  }
  return synthPromise;
}

let fallbackPromise: Promise<Synth> | null = null;

/**
 * Production synth: timestamped model first (real word timings), standard
 * kokoro-js + estimated timings as fallback. The fallback also engages
 * per-call if timed synthesis throws, so voiceover generation never gets
 * worse than it was — it only ever warns and degrades.
 */
async function getProductionSynth(): Promise<Synth> {
  let timed: Synth;
  try {
    timed = await getTimedSynth();
  } catch (error) {
    console.warn(`[voiceover] timed Kokoro unavailable (${(error as Error).message}); using estimated word timings`);
    if (!fallbackPromise) fallbackPromise = getSynth();
    return fallbackPromise;
  }
  return async (text, voiceId) => {
    try {
      return await timed(text, voiceId);
    } catch (error) {
      console.warn(`[voiceover] timed synthesis failed (${(error as Error).message}); retrying with estimated word timings`);
      if (!fallbackPromise) fallbackPromise = getSynth();
      return (await fallbackPromise)(text, voiceId);
    }
  };
}

/**
 * Digest salt covers the synthesis stack (model + word-alignment era):
 * bumping it makes every produce pipeline regenerate voiceovers, picking up
 * whatever the newer stack produces (e.g. real word timings).
 */
export function voiceoverDigest(voiceId: VoiceId, text: string): string {
  const script = text.trim().replace(/\s+/g, " ");
  return createHash("sha256").update("kokoro-ts-v1.0-q8\0").update(voiceId).update("\0").update(script).digest("hex").slice(0, 12);
}

export function estimateWordTimings(text: string, durationSeconds: number): WordTiming[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const weights = words.map((word) => Math.max(1, [...word].filter((char) => /[\p{L}\p{N}]/u.test(char)).length) + (/[.!?]$/.test(word) ? 4 : /[,;:]$/.test(word) ? 2 : 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return words.map((word, index) => {
    const start = cursor;
    cursor = index === words.length - 1 ? durationSeconds : cursor + (weights[index] / total) * durationSeconds;
    return { word, start, end: cursor };
  });
}

export function encodePcmWav(input: Float32Array, samplingRate: number): Buffer {
  if (!input.length || samplingRate < 8000 || samplingRate > 96000) throw new Error("Speech model returned empty or unsupported audio");
  const peak = input.reduce((largest, sample) => Math.max(largest, Math.abs(sample)), 0);
  const gain = peak > 0.001 ? Math.min(8, 0.89 / peak) : 1;
  const dataBytes = input.length * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(samplingRate, 24);
  wav.writeUInt32LE(samplingRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i] * gain));
    wav.writeInt16LE(Math.round(sample * (sample < 0 ? 32768 : 32767)), 44 + i * 2);
  }
  return wav;
}

export async function generateVoiceover(text: string, clipId: string, appRoot = process.cwd(), synthesize?: Synth, options: { maxDurationSeconds?: number; voiceId?: VoiceId } = {}) {
  const script = text.trim().replace(/\s+/g, " ");
  if (!script) throw new Error("Write a narration script before generating voiceover");
  if (script.length > 900) throw new Error("Narration must be 900 characters or fewer");
  const voiceId = VoiceIdSchema.parse(options.voiceId ?? "af_heart");
  const synth = synthesize ?? await getProductionSynth();
  const result = await synth(script, voiceId);
  if (!result.audio.length || result.samplingRate < 8000 || result.samplingRate > 96000) {
    throw new Error("Speech model returned empty or unsupported audio");
  }
  const durationSeconds = result.audio.length / result.samplingRate;
  if (options.maxDurationSeconds && durationSeconds > options.maxDurationSeconds - 0.25) {
    throw new Error(`Narration is ${durationSeconds.toFixed(1)}s; shorten it to fit this ${options.maxDurationSeconds}s clip.`);
  }
  const digest = voiceoverDigest(voiceId, script);
  const filename = `voiceovers/${clipId}-${digest}.wav`;
  const absolute = path.resolve(appRoot, "public", "local-assets", filename);
  await mkdir(path.dirname(absolute), { recursive: true });
  const wav = encodePcmWav(result.audio, result.samplingRate);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(absolute, wav);
  // Model-predicted spans win when the synth produced them and they cover
  // every script token; caption alignment throws on a count mismatch, so a
  // partial set must never escape this function.
  const wordCount = script.split(/\s+/).filter(Boolean).length;
  const wordTimings = result.wordTimings?.length === wordCount ? result.wordTimings : estimateWordTimings(script, durationSeconds);
  return { audioPath: `local-assets/${filename}`, durationSeconds, wordTimings, generatedFor: digest };
}
