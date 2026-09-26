import { z } from "zod";
import { getBatch, updateClip } from "@/src/lib/batch-store";
import { editClip } from "@/src/lib/clip-state";
import { requireLocalMutation } from "@/src/lib/security";
import { VoiceIdSchema } from "@/src/lib/domain";

export const runtime = "nodejs";
const patchSchema = z.object({
  concept: z.string().trim().min(1).max(180), hook: z.string().trim().min(1).max(180), keyMessage: z.string().trim().min(1).max(500),
  supportingPoint: z.string().max(400).nullable(), proof: z.string().max(500).nullable(), cta: z.string().trim().min(1).max(180),
  format: z.enum(["explainer", "demo", "proof"]), durationSeconds: z.number().int().min(10).max(60),
  sceneCopy: z.array(z.string().trim().min(1).max(220)).min(2).max(8), postCopy: z.string().max(1200),
  voiceoverScript: z.string().max(900), voiceId: VoiceIdSchema, motionStyle: z.enum(["kinetic", "float", "snap", "cinematic"]),
}).strict().superRefine((clip, context) => {
  if (clip.format === "proof" && !clip.proof?.trim()) context.addIssue({ code: "custom", path: ["proof"], message: "Proof/story clips need operator-supplied proof." });
});

export async function PUT(request: Request, context: { params: { batchId: string; clipId: string } }) {
  const denied = requireLocalMutation(request);
  if (denied) return denied;
  try {
    const currentBatch = await getBatch(context.params.batchId);
    const current = currentBatch?.clips.find((clip) => clip.id === context.params.clipId);
    if (!current) return Response.json({ error: "Clip not found" }, { status: 404 });
    const patch = patchSchema.parse(await request.json());
    const updated = editClip(current, patch);
    return Response.json({ clip: await updateClip(context.params.batchId, current.id, updated) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid clip edit" }, { status: 400 });
  }
}
