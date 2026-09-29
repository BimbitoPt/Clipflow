import type { VideoScript } from "./script";

export type ScriptOverrides = Partial<Record<number, string>>;

export function hasScriptOverrides(overrides: ScriptOverrides): boolean {
  return Object.keys(overrides).some((key) => overrides[Number(key)] !== undefined);
}

/** Keep narration, captions, cues, and post copy on one edited script. */
export function applyScriptOverrides(base: VideoScript, overrides: ScriptOverrides): VideoScript {
  if (!hasScriptOverrides(overrides)) return base;
  const original = [base.hook, ...base.beats, base.cta];
  const lines = original.map((line, index) => {
    const text = (overrides[index] ?? line).trim();
    if (!text) throw new Error(`Scene ${index + 1} cannot be empty.`);
    return text;
  });
  const hook = lines[0]!;
  const beats: VideoScript["beats"] = [lines[1]!, lines[2]!, lines[3]!];
  const cta = lines[4]!;
  const variants: VideoScript["linkedin"]["variants"] = [hook, base.linkedin.variants[1], base.linkedin.variants[2]];
  return {
    ...base,
    hook,
    beats,
    cta,
    cues: base.cues.map((cue, index) => ({ ...cue, text: lines[index]! })),
    linkedin: {
      ...base.linkedin,
      variants,
      body: `${hook}\n\n${beats.join("\n")}\n\n${cta}\n\n${base.linkedin.hashtags.join(" ")}`,
    },
  };
}
