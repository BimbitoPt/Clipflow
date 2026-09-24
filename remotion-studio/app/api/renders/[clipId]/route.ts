import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getRenderStatus } from "@/src/lib/render-queue";
import { appDataRoot, resolveInside } from "@/src/lib/file-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: { clipId: string } }) {
  const batchId = new URL(request.url).searchParams.get("batchId");
  if (!batchId) return Response.json({ error: "batchId is required" }, { status: 400 });
  try {
    const { clip, job } = await getRenderStatus(batchId, context.params.clipId);
    if (!clip) return Response.json({ error: "Clip not found" }, { status: 404 });
    const asset = new URL(request.url).searchParams.get("asset");
    if (!asset) return Response.json({ clip, job });
    const relative = asset === "video" ? clip.outputPath : asset === "cover" ? clip.coverPath : null;
    if (!relative) return Response.json({ error: "Requested artifact is not available" }, { status: 404 });
    const absolute = resolveInside(process.cwd(), relative);
    const info = await stat(absolute);
    const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
    return new Response(stream, { headers: {
      "Content-Type": asset === "video" ? "video/mp4" : "image/png",
      "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename="${relative.split("/").pop()}"`,
      "Cache-Control": "no-store",
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not read render status" }, { status: 500 });
  }
}
