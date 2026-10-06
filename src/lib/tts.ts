export interface SpeechLike {
  speak(utterance: unknown): void;
  cancel(): void;
}

export type TtsLoader = (text: string) => Promise<Float32Array>;

function defaultSynth(): SpeechLike | null {
  const g = globalThis as Record<string, unknown>;
  const synth = g["speechSynthesis"] as SpeechLike | undefined;
  if (!synth) return null;
  return {
    speak: (u: unknown) => synth.speak(u),
    cancel: () => synth.cancel(),
  };
}

export function previewSpeak(text: string, synth?: SpeechLike): void {
  const s = synth ?? defaultSynth();
  if (!s) return;
  const g = globalThis as Record<string, unknown>;
  const Utter = g["SpeechSynthesisUtterance"] as (new (t: string) => unknown) | undefined;
  const utterance = Utter ? new Utter(text) : ({ text } as unknown);
  try {
    s.cancel();
    s.speak(utterance);
  } catch {
    // preview is fire-and-forget; never throw to the caller.
  }
}

export async function synthesizeLocal(text: string, loader?: TtsLoader): Promise<Float32Array> {
  if (!loader) {
    throw new Error(
      "E_TTS_BACKEND: run `npm run model:install` to stage the local Kokoro voice model and pass its loader in (free, on-device).",
    );
  }
  return loader(text);
}
