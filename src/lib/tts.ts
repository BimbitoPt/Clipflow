export interface SpeechLike {
  speak(utterance: unknown): void;
  cancel(): void;
}

export type TtsLoader = (text: string) => Promise<Float32Array>;

function defaultSynth(): SpeechLike | null {
  const g = globalThis as Record<string, unknown>;
  const synth = g["speechSynthesis"] as SpeechLike | undefined;
  const Utter = g["SpeechSynthesisUtterance"] as (new (t: string) => unknown) | undefined;
  if (!synth || !Utter) return null;
  return {
    speak: (u: unknown) => synth.speak(u),
    cancel: () => synth.cancel(),
    ...({ utter: Utter } as object),
  } as SpeechLike;
}

export function previewSpeak(text: string, synth?: SpeechLike): void {
  const s = synth ?? defaultSynth();
  if (!s) return;
  s.cancel();
  const g = globalThis as Record<string, unknown>;
  const Utter = g["SpeechSynthesisUtterance"] as (new (t: string) => unknown) | undefined;
  if (synth) {
    s.speak({ text } as unknown);
    return;
  }
  if (Utter) s.speak(new Utter(text));
}

export async function synthesizeLocal(text: string, loader?: TtsLoader): Promise<Float32Array> {
  if (!loader) {
    throw new Error(
      "E_TTS_BACKEND: install @xenova/transformers SpeechT5 loader and pass it in (free, on-device).",
    );
  }
  return loader(text);
}
