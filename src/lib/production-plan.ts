import type { NichePack } from "./packs";
import { planFrames } from "./planner";
import type { VideoScript } from "./script";

export interface ShotCard {
  cueIndex: 0 | 1 | 2 | 3 | 4;
  kind: string;
  start: number;
  end: number;
  durationSecs: number;
  imagePrompt: string;
  cameraDirection: string;
  motionVariant: string;
  sceneLabel: string;
}

export interface StyleRef {
  packId: string;
  packLabel: string;
  bg: [string, string];
  accent: string;
  font: string;
  voice: string;
  persona: string;
}

export interface ProductionPlan {
  shots: ShotCard[];
  style: StyleRef;
  totalSecs: number;
}

const CAMERA_BY_KIND: Record<string, string> = {
  hook: "Punch-in close-up, locked 9:16 center framing, fast 0.5s push",
  beat: "Slow lateral tracking shot, subject centered in safe zone",
  cta: "Static hero framing, centered, hold for end-card legibility",
};

export function buildProductionPlan(script: VideoScript, pack: NichePack, voice: string): ProductionPlan {
  const frames = planFrames(script, 30);
  // planFrames stores the same TimedCue object refs it received, so ===
  // matches the first rendered frame of each cue; fallback keeps us total.
  const variantByCue = script.cues.map((cue) => frames.find((f) => f.cue === cue)?.variant ?? "rays");
  const theme = pack.themes[0] ?? { bg: ["#080A0D", "#101418"] as [string, string], accent: "#FFFFFF", font: "system-ui" };
  const shots: ShotCard[] = script.cues.map((cue, i) => ({
    cueIndex: i as ShotCard["cueIndex"],
    kind: cue.kind,
    start: cue.start,
    end: cue.end,
    durationSecs: Math.round((cue.end - cue.start) * 10) / 10,
    imagePrompt: `${pack.label} style, ${theme.bg[0]} to ${theme.bg[1]} gradient backdrop, ${cue.text.slice(0, 120)}`,
    cameraDirection: CAMERA_BY_KIND[cue.kind] ?? CAMERA_BY_KIND.beat!,
    motionVariant: variantByCue[i]!,
    sceneLabel: cue.text.split(" ").slice(0, 4).join(" "),
  }));
  return {
    shots,
    style: {
      packId: pack.id, packLabel: pack.label, bg: theme.bg,
      accent: theme.accent, font: theme.font, voice,
      persona: `${pack.label} voice for ${script.cues.length} scenes`,
    },
    totalSecs: Math.round((script.cues[script.cues.length - 1]!.end - script.cues[0]!.start) * 10) / 10,
  };
}
