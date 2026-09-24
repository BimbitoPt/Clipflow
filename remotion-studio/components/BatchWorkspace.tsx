"use client";

import { useCallback, useEffect, useState } from "react";
import type { Batch, BrandKit, ClipBrief } from "@/src/lib/domain";
import ClipReviewGrid from "@/components/ClipReviewGrid";
import ClipEditor from "@/components/ClipEditor";
import RenderProgress from "@/components/RenderProgress";
import ExportBatchButton from "@/components/ExportBatchButton";

type BatchPayload = { batch: Batch; clips: ClipBrief[] };

export default function BatchWorkspace({ batchId }: { batchId: string }) {
  const [data, setData] = useState<BatchPayload | null>(null);
  const [brands, setBrands] = useState<BrandKit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [renderBusy, setRenderBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const requests = [fetch(`/api/batches/${batchId}`, { cache: "no-store" })];
      if (!brands.length) requests.push(fetch("/api/brands", { cache: "no-store" }));
      const [batchResponse, brandResponse] = await Promise.all(requests);
      const batchResult = await batchResponse.json();
      if (!batchResponse.ok) throw new Error(batchResult.error ?? "Could not load batch");
      setData(batchResult);
      if (brandResponse) { const brandResult = await brandResponse.json(); setBrands(brandResult.brands ?? []); }
      setError("");
      setSelectedId((current) => batchResult.clips.some((clip: ClipBrief) => clip.id === current) ? current : batchResult.clips[0]?.id ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load batch"); }
  }, [batchId, brands.length]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!data?.clips.some((clip) => clip.status === "rendering")) return;
    const timer = setInterval(() => { void refresh(); }, 1800);
    return () => clearInterval(timer);
  }, [data, refresh]);
  const selected = data?.clips.find((clip) => clip.id === selectedId) ?? null;
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const counts = { approved: data?.clips.filter((clip) => clip.status === "approved" || clip.status === "rendered").length ?? 0, review: data?.clips.filter((clip) => clip.status === "needs_review").length ?? 0 };

  async function renderApproved() {
    setRenderBusy(true); setError("");
    try {
      const response = await fetch(`/api/batches/${batchId}/render`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not queue clips");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start render"); }
    finally { setRenderBusy(false); }
  }

  return <div className="studio-shell">
    <aside className="sidebar"><a className="brand-mark" href="/"><span className="brand-glyph">▶</span><span>CLIPFLOW <span style={{ color: "#8d98a6", fontWeight: 500 }}>REMOTION</span></span></a><nav className="nav-list"><a className="nav-item active" href="/">Studio</a><a className="nav-item" href="/brands">Brand kits</a></nav><div style={{ marginTop: "auto" }} className="eyebrow">LOCAL PRODUCTION</div></aside>
    <main className="main batch-workspace">
      <div className="topline"><a className="eyebrow" href="/">← YOUR BATCHES</a><span className="status-pill">{data?.clips.length ?? "…"} CLIPS / LOCAL DRAFT</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {data && <>
        <section className="batch-heading"><div><div className="eyebrow">BATCH REVIEW / {new Date(data.batch.createdAt).toLocaleDateString()}</div><h1>{data.batch.name}</h1><p className="subtle">Shape the story, preview it, then approve the clips ready for a local render.</p></div><div className="batch-counts"><span><b>{counts.review}</b> NEEDS REVIEW</span><span><b>{counts.approved}</b> APPROVED</span><button className="button secondary" disabled={renderBusy || !data.clips.some((clip) => clip.status === "approved" || clip.status === "rendered")} onClick={() => void renderApproved()}>{renderBusy ? "QUEUEING…" : "RENDER APPROVED"}</button><ExportBatchButton batchId={batchId} clips={data.clips} /></div></section>
        <RenderProgress clips={data.clips} />
        <div className="review-layout">
          <ClipReviewGrid clips={data.clips} brands={brandById} selectedId={selectedId} onSelect={setSelectedId} />
          {selected && <ClipEditor key={selected.id} clip={selected} brand={brandById.get(selected.brandId)} onChanged={refresh} />}
        </div>
      </>}
    </main>
  </div>;
}
