"use client";

import type { BrandKit, ClipBrief } from "@/src/lib/domain";

const stateLabel: Record<ClipBrief["status"], string> = {
  draft: "DRAFT", needs_review: "NEEDS REVIEW", approved: "APPROVED",
  rendering: "RENDERING", rendered: "READY TO POST", failed: "NEEDS ATTENTION",
};

export default function ClipReviewGrid({ clips, brands, selectedId, onSelect }: { clips: ClipBrief[]; brands: Map<string, BrandKit>; selectedId: string; onSelect: (id: string) => void }) {
  return <section className="clip-queue" aria-label="Clips for review">
    <div className="clip-queue-heading"><div><span className="eyebrow">IN THIS BATCH</span><h2>Clip queue</h2></div><span className="queue-total">{clips.length}</span></div>
    <div className="clip-queue-items">{clips.map((clip, index) => {
      const brand = brands.get(clip.brandId);
      const accent = brand?.palette.accent ?? "#CFFF47";
      return <button type="button" key={clip.id} onClick={() => onSelect(clip.id)} aria-pressed={selectedId === clip.id} className={`queue-item ${selectedId === clip.id ? "selected" : ""}`} style={{ "--clip-accent": accent } as React.CSSProperties}>
        <span className="queue-thumbnail" style={{ background: `linear-gradient(145deg, ${brand?.palette.background ?? "#080A0D"}, #18232a)` }}>{clip.status === "rendered" && clip.coverPath ? <img src={`/api/renders/${clip.id}?batchId=${clip.batchId}&asset=cover`} alt="" loading="lazy" /> : <span>{String(index + 1).padStart(2, "0")}</span>}</span>
        <span className="queue-copy"><span className="queue-brand">{brand?.name ?? clip.brandId} <span>· {String(index + 1).padStart(2, "0")}</span></span><strong>{clip.hook}</strong><span className={`queue-state ${clip.status}`}>{stateLabel[clip.status]} <small>· {clip.durationSeconds}s</small></span></span>
      </button>;
    })}</div>
  </section>;
}
