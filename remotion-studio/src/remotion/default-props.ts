import { ClipBriefSchema } from "../lib/domain";
import { buildCompositionProps } from "../lib/scene-plan";
import { starterBrands } from "../lib/seed-brands";

const defaultClip = ClipBriefSchema.parse({
  id: "clip-preview", batchId: "batch-preview", brandId: "clipflow", concept: "A useful idea", hook: "Make your next idea move.",
  keyMessage: "One clear point. A useful story. A good post.", supportingPoint: "Designed for the vertical feed.", proof: "Use operator approved proof here.",
  cta: "Create the next one.", format: "explainer", durationSeconds: 25,
  sceneCopy: ["Make your next idea move.", "One clear point.", "A useful story for the feed.", "Create the next one."], postCopy: "A clear idea, ready to move.",
  mediaOverrides: [], status: "needs_review", progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: "2026-09-24T00:00:00.000Z",
});

export const defaultCompositionProps = buildCompositionProps(defaultClip, starterBrands[0]);
