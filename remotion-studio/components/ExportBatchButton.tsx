"use client";

import type { ClipBrief } from "@/src/lib/domain";

export default function ExportBatchButton({ batchId, clips }: { batchId: string; clips: ClipBrief[] }) {
  const readyCount = clips.filter((clip) => clip.status === "rendered" && clip.outputPath && clip.coverPath).length;
  return <a
    className={`button primary${readyCount ? "" : " is-disabled"}`}
    href={readyCount ? `/api/batches/${batchId}/export` : undefined}
    aria-disabled={!readyCount}
    title={readyCount ? `Export ${readyCount} completed clip${readyCount === 1 ? "" : "s"}` : "Render approved clips before exporting"}
    onClick={(event) => { if (!readyCount) event.preventDefault(); }}
  >
    EXPORT {readyCount ? `${readyCount} CLIP${readyCount === 1 ? "" : "S"}` : "BATCH"}
  </a>;
}
