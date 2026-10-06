export const VISUAL_EFFECTS = ["none", "cinematic", "mono", "vivid", "analog"] as const;
export type VisualEffect = (typeof VISUAL_EFFECTS)[number];

export const visualEffectLabels: Record<VisualEffect, string> = {
  none: "Original",
  cinematic: "Cinematic",
  mono: "Monochrome",
  vivid: "Vivid",
  analog: "Analog scanlines",
};

export const visualEffectFilters: Record<VisualEffect, string> = {
  none: "none",
  cinematic: "contrast(1.14) saturate(0.86) brightness(0.94)",
  mono: "grayscale(1) contrast(1.2) brightness(0.96)",
  vivid: "contrast(1.09) saturate(1.42) brightness(1.03)",
  analog: "contrast(1.12) saturate(0.92) brightness(0.97)",
};
