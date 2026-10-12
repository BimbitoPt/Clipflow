import { createHash } from "node:crypto";
import type { ClipBrief, ClipFormat } from "./domain";

const curated = {
  clipflow: { folder: "clipflow-spine", music: "scene-audio/clipflow-bed.wav" },
  mstudio: { folder: "mstudio-pricing", music: "scene-audio/mstudio-bed.wav" },
} as const;

export function defaultCreativeTreatment(brandId: string, format: ClipFormat, sceneCount = 4): NonNullable<ClipBrief["creative"]> {
  const pack = curated[brandId as keyof typeof curated];
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const bg = pack ? (() => {
      const prompt = `Curated text-free ${brandId} cinematic vertical scene ${index + 1}; replace with a topic-specific still during editorial review.`;
      return { prompt, promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 12), imagePath: `scene-backgrounds/${pack.folder}/scene-${index % 4 + 1}.png` };
    })() : undefined;
    return {
      bg,
      motionIntent: "auto" as const,
      evidenceApproved: false,
    };
  });
  return {
    template: "cinematic-story", sceneSeconds: Array.from({ length: sceneCount }, (_, index) => index === sceneCount - 2 ? 4.5 : 3),
    scenes, captionCues: [], musicPath: pack?.music ?? null, sfxPath: null,
  };
}
