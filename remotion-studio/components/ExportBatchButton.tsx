"use client";

import type { ClipBrief } from "@/src/lib/domain";

export default function ExportBatchButton({ batchId, clips, disabled = false }: { batchId: string; clips: ClipBrief[]; disabled?: boolean }) {
  const readyCount = clips.filter((clip) => clip.status === "rendered" && clip.outputPath && clip.coverPath).length;
  const canExport = readyCount > 0 && !disabled;
  return <a
    className={`button primary${canExport ? "" : " is-disabled"}`}
    href={canExport ? `/api/batches/${batchId}/export` : undefined}
    aria-disabled={!canExport}
    title={disabled ? "Save the selected clip before exporting" : readyCount ? `Export ${readyCount} completed clip${readyCount === 1 ? "" : "s"}` : "Render approved clips before exporting"}
    onClick={(event) => { if (!canExport) event.preventDefault(); }}
  >
    EXPORT {readyCount ? `${readyCount} CLIP${readyCount === 1 ? "" : "S"}` : "BATCH"}
  </a>;
}
