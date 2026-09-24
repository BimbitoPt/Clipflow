import { getBatch } from "@/src/lib/batch-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: { batchId: string } }) {
  try {
    const result = await getBatch(context.params.batchId);
    return result ? Response.json(result) : Response.json({ error: "Batch not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load batch" }, { status: 500 });
  }
}
