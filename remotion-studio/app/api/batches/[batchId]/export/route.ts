import { Readable } from "node:stream";
import { getBatch } from "@/src/lib/batch-store";
import { listBrands } from "@/src/lib/brand-store";
import { buildBatchExportPlan, createBatchZip } from "@/src/lib/export-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { batchId: string } }) {
  try {
    const batchData = await getBatch(params.batchId);
    if (!batchData) return Response.json({ error: "Batch not found" }, { status: 404 });
    const plan = await buildBatchExportPlan(batchData, await listBrands());
    const zip = createBatchZip(plan);
    return new Response(Readable.toWeb(zip) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${plan.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not export batch" }, { status: 409 });
  }
}
