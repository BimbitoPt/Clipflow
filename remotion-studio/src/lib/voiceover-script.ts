import type { ClipBrief } from "./domain";

export function defaultVoiceoverScript(clip: Pick<ClipBrief, "hook" | "keyMessage" | "supportingPoint" | "proof" | "cta">) {
  const script = [clip.hook, clip.keyMessage, clip.supportingPoint, clip.proof, clip.cta]
    .filter((part, index, all): part is string => Boolean(part?.trim()) && all.findIndex((value) => value?.trim().toLowerCase() === part?.trim().toLowerCase()) === index)
    .join(" ");
  if (script.length <= 900) return script;
  return `${script.slice(0, 900).replace(/\s+\S*$/, "").trimEnd()}.`;
}
