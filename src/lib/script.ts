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
  if (arr.length === 0) throw new Error("E_EMPTY_BANK");
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return arr[h % arr.length]!;
}

export function buildScript(idea: string, profile: Profile, pack: NichePack): VideoScript {
  let clean = idea.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("E_EMPTY_IDEA: idea must be non-empty");
  clean = clean.length <= 140 ? clean : clean.slice(0, 140).replace(/\s+\S*$/, "");
  const carEdit = /\b(porsche|gt3|gt3rs|car edit|car footage|nightdrive)\b/i.test(clean);
  const subject = /\b(?:gt3\s*rs|gt3rs)\b/i.test(clean) ? "PORSCHE GT3 RS" : /\bporsche\b/i.test(clean) ? "PORSCHE" : "THE CAR";
  // Showcase copy does not invent a location, speed, race, or performance figure.
  const hook = carEdit ? subject : `${pick(pack.hooks, clean)} ${clean}.`;
  const beats: [string, string, string] = carEdit ? ["A CLOSER LOOK", "THE DETAILS", "SAME CAR. NEW ANGLE."] : [
    `${profile.audience} keep losing to competitors who look finished.`,
    `Proof: ${profile.proof}.`,
    `You get ${profile.offer}. ${profile.tone}.`,
  ];
  const cta = carEdit ? "YOUR FAVORITE SHOT?" : `${pick(pack.ctas, clean + "\n" + profile.niche)}`;
  const cues: TimedCue[] = [
    { start: 0, end: 4, kind: "hook", text: hook },
    { start: 4, end: 16, kind: "beat", text: beats[0]! },
    { start: 16, end: 28, kind: "beat", text: beats[1]! },
    { start: 28, end: 40, kind: "beat", text: beats[2]! },
    { start: 40, end: 45, kind: "cta", text: cta },
  ];
  const variants: [string, string, string] = [
    `${hook}`,
    `Stop looking unfinished: ${profile.offer}.`,
    `${profile.niche} for ${profile.audience}. ${profile.tone}.`,
  ];
  return {
    hook, beats, cta, cues,
    linkedin: { variants, body: `${variants[0]}\n\n${beats.join("\n")}\n\n${cta}\n\n${[...pack.hashtags].join(" ")}`, hashtags: [...pack.hashtags] },
  };
}
