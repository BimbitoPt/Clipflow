import { getBatch, updateClip } from "@/src/lib/batch-store";
import { approveClip, unapproveClip } from "@/src/lib/clip-state";
import { requireLocalMutation } from "@/src/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: { batchId: string; clipId: string } }) {
  const denied = requireLocalMutation(request);
  if (denied) return denied;
  try {
    const { approved } = await request.json() as { approved?: unknown };
    if (typeof approved !== "boolean") return Response.json({ error: "approved must be true or false" }, { status: 400 });
    const batch = await getBatch(context.params.batchId);
    const clip = batch?.clips.find((item) => item.id === context.params.clipId);
    if (!clip) return Response.json({ error: "Clip not found" }, { status: 404 });
    const updated = approved ? approveClip(clip) : unapproveClip(clip);
    return Response.json({ clip: await updateClip(context.params.batchId, clip.id, updated) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update approval" }, { status: 400 });
  }
}
