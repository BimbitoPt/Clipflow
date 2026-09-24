"use client";

import { useEffect, useState } from "react";
import type { Batch, ClipBrief } from "@/src/lib/domain";

type BatchWithClips = { batch: Batch; clips: ClipBrief[] };

export default function StudioDashboard() {
  const [batches, setBatches] = useState<BatchWithClips[]>([]);
  const [brandCount, setBrandCount] = useState(0);
  useEffect(() => {
    void Promise.all([fetch("/api/batches").then((response) => response.json()), fetch("/api/brands").then((response) => response.json())])
      .then(([batchResult, brandResult]) => { setBatches(batchResult.batches ?? []); setBrandCount(brandResult.brands?.length ?? 0); }).catch(() => undefined);
  }, []);
  const clips = batches.flatMap((batch) => batch.clips);
  const counts = { production: clips.filter((clip) => ["approved", "rendering", "failed"].includes(clip.status)).length, review: clips.filter((clip) => clip.status === "needs_review").length };
  return <div className="studio-shell">
    <aside className="sidebar"><div className="brand-mark"><span className="brand-glyph">▶</span><span>CLIPFLOW <span style={{ color: "#8d98a6", fontWeight: 500 }}>REMOTION</span></span></div><nav className="nav-list" aria-label="Main navigation"><a className="nav-item active" href="/">Studio</a><a className="nav-item" href="/brands">Brand kits</a></nav><div style={{ marginTop: "auto" }} className="eyebrow">LOCAL PRODUCTION</div></aside>
    <main className="main">
      <div className="topline"><span className="eyebrow">CONTENT OPERATIONS / 01</span><span className="status-pill">● LOCAL WORKSPACE</span></div>
      <section className="hero"><div><div className="eyebrow">DAILY VIDEO FACTORY</div><h1>Make the next<br />good post move.</h1><p className="subtle">Plan a mixed-brand batch, shape each story, then preview and approve every clip before it renders.</p></div><a className="button" href="/batches/new">＋ &nbsp; CREATE A BATCH</a></section>
      <section className="stats" aria-label="Studio overview"><div className="panel stat"><span className="stat-number">{counts.production}</span><span className="stat-label">CLIPS IN PRODUCTION</span></div><div className="panel stat"><span className="stat-number">{counts.review}</span><span className="stat-label">READY TO REVIEW</span></div><div className="panel stat"><span className="stat-number">{brandCount}</span><span className="stat-label">BRAND KITS</span></div></section>
      <section><div className="section-heading"><h2>Recent batches</h2><span className="eyebrow">YOUR LIBRARY</span></div>
        {batches.length ? <div className="batch-list">{batches.map(({ batch, clips: batchClips }) => <a className="panel batch-row" key={batch.id} href={`/batches/${batch.id}`}><span><b>{batch.name}</b><small>{new Date(batch.createdAt).toLocaleString()}</small></span><span className="batch-row-count">{batchClips.length} CLIPS</span><span className="arrow">›</span></a>)}</div> : <div className="panel empty"><div className="empty-mark">✳</div><h3>Your next batch starts here</h3><p>Bring 10–20 hooks and ideas together across Clipflow, MStudio Web, Sabre and any brands you add.</p><a className="button" href="/batches/new">BUILD A CLIP BATCH</a></div>}
      </section>
    </main>
  </div>;
}
