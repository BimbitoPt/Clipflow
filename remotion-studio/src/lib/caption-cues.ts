import type { ClipBrief, WordTiming } from "./domain";

type Cue = NonNullable<ClipBrief["creative"]>["captionCues"][number];
type Phrase = { text: string; emphasis?: string[] };

function tokens(text: string) { return text.trim().split(/\s+/).filter(Boolean).map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")); }

export function alignCaptionPhrases(script: string, phrases: Phrase[], timings: WordTiming[]): Cue[] {
  const all = tokens(script);
  if (all.length !== timings.length) throw new Error("Narration and word timings have different lengths");
  let cursor = 0;
  const cues = phrases.map(({ text, emphasis = [] }) => {
    const words = tokens(text);
    if (!words.length || all.slice(cursor, cursor + words.length).join(" ") !== words.join(" ")) throw new Error(`Caption does not match narration: ${text}`);
    const start = Math.max(0, timings[cursor].start - .06);
    cursor += words.length;
    return { text, start, end: timings[cursor - 1].end + .08, emphasis };
  });
  if (cursor !== all.length) throw new Error("Captions do not cover the full narration");
  return cues;
}

export function autoCaptionCues(script: string, timings: WordTiming[]): Cue[] {
  const sentences = (script.match(/[^.!?;:]+[.!?;:]?/g) ?? []).map((part) => part.trim()).filter(Boolean);
  const phrases = sentences.flatMap((sentence) => {
    if (sentence.length <= 120) return [{ text: sentence }];
    const words = sentence.split(/\s+/);
    const parts: Phrase[] = [];
    for (let index = 0; index < words.length; index += 12) parts.push({ text: words.slice(index, index + 12).join(" ") });
    return parts;
  });
  return alignCaptionPhrases(script, phrases, timings);
}
