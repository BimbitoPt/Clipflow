import { enqueueApproved } from "@/src/lib/render-queue";
import { requireLocalMutation } from "@/src/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: { batchId: string } }) {
  const denied = requireLocalMutation(request);
  if (denied) return denied;
  try {
    const jobs = await enqueueApproved(context.params.batchId);
    return Response.json({ jobs }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not queue approved clips" }, { status: 400 });
  }
}
