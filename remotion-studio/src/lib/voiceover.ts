import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { WordTiming } from "./domain";

export type SynthesizedVoice = { audio: Float32Array; samplingRate: number };
type Synth = (text: string) => Promise<SynthesizedVoice>;

let synthPromise: Promise<Synth> | null = null;

function getSynth(): Promise<Synth> {
  if (!synthPromise) {
    synthPromise = (async () => {
      const { env, pipeline } = await import("@xenova/transformers");
      env.localModelPath = path.resolve(process.cwd(), "..", "public", "models");
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.useFSCache = false;
      const tts = await pipeline("text-to-speech", "Xenova/speecht5_tts", { quantized: true });
      const speakerPath = path.resolve(env.localModelPath, "speaker_embeddings.bin");
      const raw = await readFile(speakerPath);
      if (raw.length !== 512 * 4) throw new Error("SpeechT5 speaker embeddings are missing or invalid");
      const speaker = new Float32Array(512);
      for (let i = 0; i < speaker.length; i++) speaker[i] = raw.readFloatLE(i * 4);
      return async (text: string) => {
        const result = await tts(text, { speaker_embeddings: speaker });
        return { audio: result.audio, samplingRate: result.sampling_rate };
      };
    })().catch((error) => {
      synthPromise = null;
      throw error;
    });
  }
  return synthPromise;
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

export async function generateVoiceover(text: string, clipId: string, appRoot = process.cwd(), synthesize?: Synth, options: { maxDurationSeconds?: number } = {}) {
  const script = text.trim().replace(/\s+/g, " ");
  if (!script) throw new Error("Write a narration script before generating voiceover");
  if (script.length > 900) throw new Error("Narration must be 900 characters or fewer");
  const synth = synthesize ?? await getSynth();
  const result = await synth(script);
  const durationSeconds = result.audio.length / result.samplingRate;
  if (options.maxDurationSeconds && durationSeconds > options.maxDurationSeconds - 0.25) {
    throw new Error(`Narration is ${durationSeconds.toFixed(1)}s; shorten it to fit this ${options.maxDurationSeconds}s clip.`);
  }
  const digest = createHash("sha256").update(script).digest("hex").slice(0, 12);
  const filename = `voiceovers/${clipId}-${digest}.wav`;
  const absolute = path.resolve(appRoot, "public", "local-assets", filename);
  await mkdir(path.dirname(absolute), { recursive: true });
  const wav = encodePcmWav(result.audio, result.samplingRate);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(absolute, wav);
  return { audioPath: `local-assets/${filename}`, durationSeconds, wordTimings: estimateWordTimings(script, durationSeconds), generatedFor: digest };
}
