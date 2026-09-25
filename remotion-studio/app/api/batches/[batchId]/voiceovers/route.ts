import { getVoiceoverJob, enqueueMissingVoiceovers } from "@/src/lib/voiceover-queue";
import { requireLocalMutation } from "@/src/lib/security";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: { batchId: string } }) {
  try {
    return Response.json({ job: await getVoiceoverJob(context.params.batchId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not read voiceover progress" }, { status: 400 });
  }
}

export async function POST(request: Request, context: { params: { batchId: string } }) {
  const denied = requireLocalMutation(request);
  if (denied) return denied;
  try {
    const job = await enqueueMissingVoiceovers(context.params.batchId);
    return Response.json({ job }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not queue voiceovers" }, { status: 400 });
  }
}
