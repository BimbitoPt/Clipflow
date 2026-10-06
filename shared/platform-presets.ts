/**
 * Platform export presets (TikTok / Reels / Shorts).
 *
 * One 720x1280 file serves all three, so presets don't change pixels —
 * they tune caption placement inside the safe band and carry the
 * per-platform spec guidance the exporter shows. Anchors differ because
 * each app's overlay crowds a different edge: Reels' right rail and
 * bottom caption push text highest, Shorts' title + progress bar squeeze
 * both ends, TikTok sits between.
 */

export type PlatformId = "tiktok" | "reels" | "shorts";

export interface PlatformPreset {
  id: PlatformId;
  label: string;
  /** Caption baseline as a fraction of frame height — always in 0.60-0.70. */
  captionAnchor: number;
  /** Short spec line shown next to the export controls. */
  spec: string;
  /** One actionable placement tip shown next to the export controls. */
  tip: string;
}

export const PLATFORM_PRESETS: readonly PlatformPreset[] = [
  {
    id: "tiktok",
    label: "TikTok",
    captionAnchor: 0.64,
    spec: "9:16 · 720x1280 · 30-60s sweet spot",
    tip: "Bottom 250px belongs to TikTok's UI — captions stay centered.",
  },
  {
    id: "reels",
    label: "Instagram Reels",
    captionAnchor: 0.62,
    spec: "9:16 · 720x1280 · 30-90s",
    tip: "Reels stack buttons right and caption bottom — keep text upper-center.",
  },
  {
    id: "shorts",
    label: "YouTube Shorts",
    captionAnchor: 0.66,
    spec: "9:16 · 720x1280 · under 60s for the boost",
    tip: "Shorts overlay title top and progress bottom — middle band is safest.",
  },
];

export function platformPreset(id: string | null | undefined): PlatformPreset {
  return PLATFORM_PRESETS.find((preset) => preset.id === id) ?? PLATFORM_PRESETS[0]!;
}

export function isPlatformId(value: unknown): value is PlatformId {
  return value === "tiktok" || value === "reels" || value === "shorts";
}
