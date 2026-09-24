"use client";

import { useCallback, useEffect, useState } from "react";
import type { Batch, BrandKit, ClipBrief } from "@/src/lib/domain";
import ClipReviewGrid from "@/components/ClipReviewGrid";
import ClipEditor from "@/components/ClipEditor";

type BatchPayload = { batch: Batch; clips: ClipBrief[] };

export default function BatchWorkspace({ batchId }: { batchId: string }) {
  const [data, setData] = useState<BatchPayload | null>(null);
  const [brands, setBrands] = useState<BrandKit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [batchResponse, brandResponse] = await Promise.all([fetch(`/api/batches/${batchId}`, { cache: "no-store" }), fetch("/api/brands", { cache: "no-store" })]);
      const batchResult = await batchResponse.json(); const brandResult = await brandResponse.json();
      if (!batchResponse.ok) throw new Error(batchResult.error ?? "Could not load batch");
      setData(batchResult); setBrands(brandResult.brands ?? []); setError("");
      setSelectedId((current) => batchResult.clips.some((clip: ClipBrief) => clip.id === current) ? current : batchResult.clips[0]?.id ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load batch"); }
  }, [batchId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const selected = data?.clips.find((clip) => clip.id === selectedId) ?? null;
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const counts = { approved: data?.clips.filter((clip) => clip.status === "approved" || clip.status === "rendered").length ?? 0, review: data?.clips.filter((clip) => clip.status === "needs_review").length ?? 0 };

  return <div className="studio-shell">
    <aside className="sidebar"><a className="brand-mark" href="/"><span className="brand-glyph">▶</span><span>CLIPFLOW <span style={{ color: "#8d98a6", fontWeight: 500 }}>REMOTION</span></span></a><nav className="nav-list"><a className="nav-item active" href="/">Studio</a><a className="nav-item" href="/brands">Brand kits</a></nav><div style={{ marginTop: "auto" }} className="eyebrow">LOCAL PRODUCTION</div></aside>
    <main className="main batch-workspace">
      <div className="topline"><a className="eyebrow" href="/">← YOUR BATCHES</a><span className="status-pill">{data?.clips.length ?? "…"} CLIPS / LOCAL DRAFT</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {data && <>
        <section className="batch-heading"><div><div className="eyebrow">BATCH REVIEW / {new Date(data.batch.createdAt).toLocaleDateString()}</div><h1>{data.batch.name}</h1><p className="subtle">Shape the story, preview it, then approve the clips ready for a local render.</p></div><div className="batch-counts"><span><b>{counts.review}</b> NEEDS REVIEW</span><span><b>{counts.approved}</b> APPROVED</span><button className="button secondary" disabled title="Rendering is the next implementation step">RENDER APPROVED</button></div></section>
        <div className="review-layout">
          <ClipReviewGrid clips={data.clips} brands={brandById} selectedId={selectedId} onSelect={setSelectedId} />
          {selected && <ClipEditor key={selected.id} clip={selected} brand={brandById.get(selected.brandId)} onChanged={refresh} />}
        </div>
      </>}
    </main>
  </div>;
}
