"use client";

import type { BrandKit, ClipBrief } from "@/src/lib/domain";

export default function ClipReviewGrid({ clips, brands, selectedId, onSelect }: { clips: ClipBrief[]; brands: Map<string, BrandKit>; selectedId: string; onSelect: (id: string) => void }) {
  return <section className="clip-grid" aria-label="Clips for review">
    {clips.map((clip, index) => {
      const brand = brands.get(clip.brandId);
      return <button type="button" key={clip.id} onClick={() => onSelect(clip.id)} className={`clip-card ${selectedId === clip.id ? "selected" : ""}`}>
        <div className="clip-art" style={{ background: `radial-gradient(circle at 75% 20%, ${brand?.palette.accent ?? "#246BFD"}88, transparent 37%), linear-gradient(155deg, ${brand?.palette.background ?? "#080A0D"}, #121820)` }}>
          <span className="clip-index">{String(index + 1).padStart(2, "0")}</span><span className="clip-art-title">{clip.hook}</span><span className="clip-art-brand">{brand?.name ?? clip.brandId}</span>
        </div>
        <div className="clip-meta"><span className={`state-dot ${clip.status}`} />{clip.status.replace("_", " ")}<span className="clip-format">{clip.format}</span></div>
      </button>;
    })}
  </section>;
}
