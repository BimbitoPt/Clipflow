import { z } from "zod";
import { getBatch, updateClip } from "@/src/lib/batch-store";
import { requireLocalMutation } from "@/src/lib/security";
import { generateVoiceover } from "@/src/lib/voiceover";

export const runtime = "nodejs";
export const maxDuration = 300;
const bodySchema = z.object({ script: z.string().trim().min(1).max(900) }).strict();

export async function POST(request: Request, context: { params: { batchId: string; clipId: string } }) {
  const denied = requireLocalMutation(request);
  if (denied) return denied;
  try {
    const batch = await getBatch(context.params.batchId);
    const clip = batch?.clips.find((item) => item.id === context.params.clipId);
    if (!clip) return Response.json({ error: "Clip not found" }, { status: 404 });
    if (clip.status === "rendering") return Response.json({ error: "A rendering clip cannot generate voiceover" }, { status: 409 });
    const { script } = bodySchema.parse(await request.json());
    const voiceover = await generateVoiceover(script, clip.id, process.cwd(), undefined, { maxDurationSeconds: clip.durationSeconds });
    const updated = { ...clip, voiceover: { ...clip.voiceover, script, ...voiceover }, status: "needs_review" as const, progress: 0, outputPath: null, coverPath: null, renderError: null, updatedAt: new Date().toISOString() };
    await updateClip(clip.batchId, clip.id, updated);
    return Response.json({ clip: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voiceover generation failed";
    return Response.json({ error: message }, { status: message.startsWith("Narration is ") ? 422 : 400 });
  }
}
