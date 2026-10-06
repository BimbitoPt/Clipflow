export type CaptionMode = "auto" | "scene" | "speech" | "off";
export interface CaptionPhrase { text: string; start: number; end: number; kind: "scene" | "speech" }
export interface CaptionWord { word: string; start: number; end: number; cueKind?: string; cueIndex?: number }

export function resolveCaptionMode(mode: CaptionMode, voiceOn: boolean, copy = ""): Exclude<CaptionMode, "auto"> {
  if (mode !== "auto") return mode;
  return !voiceOn || /\b(porsche|gt3|gt3rs|car edit|car footage|nightdrive)\b/i.test(copy) ? "scene" : "speech";
}

/** A label must be a complete phrase; avoid clipping away qualifiers or negation. */
export function suggestSceneLabel(copy: string): string {
  const first = copy.trim().split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  return first.length <= 80 ? first : "";
}

export function speechPhrases(words: readonly CaptionWord[]): CaptionPhrase[] {
  const out: CaptionPhrase[] = [];
  let group: CaptionWord[] = [];
  const flush = () => {
    if (group.length) out.push({ text: group.map((item) => item.word).join(" "), start: group[0]!.start, end: group.at(-1)!.end, kind: "speech" });
    group = [];
  };
  for (const word of words) {
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) continue;
    const previous = group.at(-1);
    if (previous && (word.cueIndex !== previous.cueIndex || word.cueKind !== previous.cueKind || word.start - previous.end > .45)) flush();
    group.push(word);
    // Never leave a meaning-changing qualifier at the end of a chunk.
    const needsNext = /^(no|not|never|without|isn't|isn’t|don't|don’t|the|a|an)$/i.test(word.word);
    if (/[.!?;:]$/.test(word.word) || (group.length >= 5 && !needsNext)) flush();
  }
  flush();
  return out;
}

export function makeCaptionPlan(input: {
  mode: CaptionMode; voiceOn: boolean;
  scenes: readonly { text: string; start: number; end: number }[];
  labels?: readonly string[]; words?: readonly CaptionWord[];
}): CaptionPhrase[] {
  const mode = resolveCaptionMode(input.mode, input.voiceOn, input.scenes.map(scene => scene.text).join(" "));
  if (mode === "off") return [];
  if (mode === "speech") return speechPhrases(input.words ?? []);
  return input.scenes.flatMap((scene, index) => {
    const text = (input.labels?.[index] ?? suggestSceneLabel(scene.text)).trim();
    return text ? [{ text, start: scene.start, end: scene.end, kind: "scene" as const }] : [];
  });
}
