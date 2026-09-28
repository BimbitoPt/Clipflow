import { z } from "zod";

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/);
const hexColorSchema = z.string().regex(/^#[\da-fA-F]{6}$/);
const localPathSchema = z.string().max(240).refine((value) => {
  if (value === "") return true;
  if (value.includes("\\") || value.startsWith("/") || value.includes(":") || value.includes("..")) return false;
  return value.split("/").every((part) => part.length > 0 && part !== ".");
}, "Expected a safe app-relative media path");

export const BrandKitSchema = z.object({
  schemaVersion: z.literal(1),
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  palette: z.object({ background: hexColorSchema, foreground: hexColorSchema, accent: hexColorSchema, accentAlt: hexColorSchema }),
  fonts: z.object({ heading: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(80) }),
  logoPath: localPathSchema.nullable(),
  audioPath: localPathSchema.nullable(),
  toneNotes: z.string().max(1200),
  defaultCta: z.string().trim().min(1).max(180),
  captionStyle: z.object({ wordsPerChunk: z.number().int().min(1).max(5), highlightColor: hexColorSchema, safeAreaPercent: z.number().min(5).max(20) }),
  approvedAssets: z.array(z.object({ path: localPathSchema, note: z.string().max(300), source: z.string().max(300) })).max(100),
  updatedAt: z.string().datetime(),
});

export const ClipFormatSchema = z.enum(["explainer", "demo", "proof"]);
export const ClipStatusSchema = z.enum(["draft", "needs_review", "approved", "rendering", "rendered", "failed"]);
export const MotionStyleSchema = z.enum(["kinetic", "float", "snap", "cinematic"]);
export const VoiceIdSchema = z.enum(["af_heart", "af_bella", "am_michael"]);
export type VoiceId = z.infer<typeof VoiceIdSchema>;
export function defaultVoiceIdForBrand(brandId: string): VoiceId {
  return brandId === "mstudio" ? "af_bella" : "af_heart";
}
export const WordTimingSchema = z.object({ word: z.string().min(1).max(900), start: z.number().min(0), end: z.number().positive() });
export const VoiceoverSchema = z.object({
  script: z.string().max(900).default(""),
  voiceId: VoiceIdSchema.default("af_heart"),
  audioPath: localPathSchema.nullable().default(null),
  wordTimings: z.array(WordTimingSchema).max(450).default([]),
  generatedFor: z.string().max(64).nullable().default(null),
}).default({ script: "", voiceId: "af_heart", audioPath: null, wordTimings: [], generatedFor: null });

export const CreativeTreatmentSchema = z.object({
  template: z.enum(["clipflow-spine", "mstudio-pricing", "cinematic-story", "proof-series", "proof-hero"]),
  sceneSeconds: z.array(z.number().positive().max(20)).min(2).max(8),
  scenes: z.array(z.object({
    bg: z.object({ prompt: z.string().trim().min(1).max(1000), imagePath: localPathSchema, promptHash: z.string().regex(/^[a-f0-9]{12}$/) }).optional(),
    visual: z.object({ kind: z.enum(["steps", "cards"]), items: z.array(z.string().trim().min(1).max(36)).min(2).max(5) }).optional(),
    motionGraphic: z.enum(["filmstrip", "site-network"]).optional(),
    screen: z.object({ imagePath: localPathSchema, sourceUrl: z.string().url().max(500) }).optional(),
  })).min(2).max(8),
  captionCues: z.array(z.object({ text: z.string().trim().min(1).max(120), start: z.number().min(0), end: z.number().positive(), emphasis: z.array(z.string().trim().min(1).max(40)).max(5) })).max(30),
  musicPath: localPathSchema.nullable(),
  sfxPath: localPathSchema.nullable(),
  source: z.object({ title: z.string().trim().min(1).max(180), url: z.string().url().max(500), publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), verifiedAt: z.string().datetime() }).optional(),
}).nullable().default(null);

export const ClipBriefSchema = z.object({
  id: idSchema,
  batchId: idSchema,
  brandId: idSchema,
  concept: z.string().trim().min(1).max(180),
  hook: z.string().trim().min(1).max(180),
  keyMessage: z.string().trim().min(1).max(500),
  supportingPoint: z.string().max(400).nullable(),
  proof: z.string().max(500).nullable(),
  cta: z.string().trim().min(1).max(180),
  format: ClipFormatSchema,
  durationSeconds: z.number().int().min(10).max(60),
  sceneCopy: z.array(z.string().trim().min(1).max(220)).min(2).max(8),
  postCopy: z.string().max(1200),
  mediaOverrides: z.array(localPathSchema).max(12),
  voiceover: VoiceoverSchema,
  creative: CreativeTreatmentSchema,
  motionStyle: MotionStyleSchema.default("kinetic"),
  status: ClipStatusSchema,
  progress: z.number().min(0).max(1),
  outputPath: localPathSchema.nullable(),
  coverPath: localPathSchema.nullable(),
  renderError: z.string().max(500).nullable(),
  updatedAt: z.string().datetime(),
});

export const BatchSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  clipIds: z.array(idSchema).min(1).max(20),
});

export type BrandKit = z.infer<typeof BrandKitSchema>;
export type ClipFormat = z.infer<typeof ClipFormatSchema>;
export type ClipStatus = z.infer<typeof ClipStatusSchema>;
export type ClipBrief = z.infer<typeof ClipBriefSchema>;
export type WordTiming = z.infer<typeof WordTimingSchema>;
export type Batch = z.infer<typeof BatchSchema>;
