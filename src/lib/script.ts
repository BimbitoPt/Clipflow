import type { NichePack } from "./packs";
import type { Profile } from "./profile";

export type CueKind = "hook" | "beat" | "cta";

export interface TimedCue { start: number; end: number; kind: CueKind; text: string; }

export interface VideoScript {
  hook: string;
  beats: [string, string, string];
  cta: string;
  cues: TimedCue[];
  linkedin: { variants: [string, string, string]; body: string; hashtags: string[] };
}

function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return arr[h % arr.length]!;
}

export function buildScript(idea: string, profile: Profile, pack: NichePack): VideoScript {
  const clean = idea.trim().replace(/\s+/g, " ");
  const hook = `${pick(pack.hooks, clean)} ${clean}.`;
  const beats: [string, string, string] = [
    `Problem: ${profile.audience} struggle because ${clean} is missing.`,
    `Proof for ${clean}: ${profile.proof}.`,
    `Offer: ${profile.offer} — ${profile.tone}.`,
  ];
  const cta = `${pick(pack.ctas, clean + profile.niche)} ${clean}.`;
  const cues: TimedCue[] = [
    { start: 0, end: 4, kind: "hook", text: hook },
    { start: 4, end: 16, kind: "beat", text: beats[0]! },
    { start: 16, end: 28, kind: "beat", text: beats[1]! },
    { start: 28, end: 40, kind: "beat", text: beats[2]! },
    { start: 40, end: 45, kind: "cta", text: cta },
  ];
  const variants: [string, string, string] = [
    `${hook}`,
    `Unpopular opinion for ${profile.audience}: ${clean}.`,
    `We build ${profile.niche} that ship. ${profile.offer}.`,
  ];
  return {
    hook, beats, cta, cues,
    linkedin: { variants, body: `${variants[0]}\n\n${beats.join("\n")}\n\n${cta}`, hashtags: pack.hashtags },
  };
}
