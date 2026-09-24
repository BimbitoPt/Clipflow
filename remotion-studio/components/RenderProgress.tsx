import type { ClipBrief } from "@/src/lib/domain";

export default function RenderProgress({ clips }: { clips: ClipBrief[] }) {
  const running = clips.filter((clip) => clip.status === "rendering");
  const rendered = clips.filter((clip) => clip.status === "rendered");
  const failed = clips.filter((clip) => clip.status === "failed");
  if (!running.length && !rendered.length && !failed.length) return null;
  const average = running.length ? Math.round(running.reduce((sum, clip) => sum + clip.progress, 0) / running.length * 100) : 0;
  return <section className="render-progress panel" aria-live="polite">
    <div className="render-summary"><div><span className="eyebrow">LOCAL RENDER QUEUE</span><b>{running.length ? `${running.length} IN PROGRESS · ${average}%` : "QUEUE IDLE"}</b></div><span className="render-result-count">{rendered.length} DONE · {failed.length} FAILED</span></div>
    {running.length > 0 && <div className="progress-track"><i style={{ width: `${average}%` }} /></div>}
    {failed.length > 0 && <p className="render-failure">{failed.length} clip{failed.length === 1 ? "" : "s"} failed. Open each clip, review the error and approve it again to retry.</p>}
  </section>;
}
