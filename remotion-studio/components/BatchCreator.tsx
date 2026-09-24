"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandKit } from "@/src/lib/domain";

const csvTemplate = [
  "brandId,concept,hook,keyMessage,supportingPoint,proof,cta,format,durationSeconds,postCopy",
  "clipflow,One idea to finished video,What if the first draft took minutes?,Clipflow turns a short brief into a finished vertical video.,Script and motion in one workflow,,,explainer,25,Idea in motion.",
  "mstudio,Website conversion,Your website should sell while you sleep.,A clear website turns interested visitors into enquiries.,,Use only verified brand facts,Start at mstudioweb.pt,explainer,25,",
].join("\n");

export default function BatchCreator() {
  const router = useRouter();
  const [name, setName] = useState("Marketing batch / September 24");
  const [csv, setCsv] = useState("");
  const [brands, setBrands] = useState<BrandKit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void fetch("/api/brands").then((response) => response.json()).then((result) => setBrands(result.brands ?? [])).catch(() => setError("Could not load brand kits.")); }, []);

  async function createBatch() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, csv }) });
      const result = await response.json();
      if (!response.ok) throw new Error([result.error, ...(result.errors ?? [])].filter(Boolean).join("\n"));
      router.push(`/batches/${result.batch.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create batch."); }
    finally { setBusy(false); }
  }

  async function readFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Choose a .csv file."); return; }
    setCsv(await file.text()); setError("");
  }

  return <div className="studio-shell">
    <aside className="sidebar"><a className="brand-mark" href="/"><span className="brand-glyph">▶</span><span>CLIPFLOW <span style={{ color: "#8d98a6", fontWeight: 500 }}>REMOTION</span></span></a><nav className="nav-list"><a className="nav-item" href="/">Studio</a><a className="nav-item" href="/brands">Brand kits</a></nav><div style={{ marginTop: "auto" }} className="eyebrow">LOCAL PRODUCTION</div></aside>
    <main className="main">
      <div className="topline"><a className="eyebrow" href="/">← STUDIO / NEW BATCH</a><span className="status-pill">10–20 CLIPS</span></div>
      <section className="hero"><div><div className="eyebrow">BATCH WORKFLOW / 01</div><h1>Gather the<br />next 10 stories.</h1><p className="subtle">Mix brands in one batch. Every row becomes its own editable clip brief, composition and approval.</p></div></section>
      <section className="panel creator-panel">
        <div className="form-grid"><label className="wide">Batch name<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label></div>
        <div className="import-title"><div><h2>Bring in your briefs</h2><p>Paste CSV or import a .csv file. Include at least 10 and at most 20 clip rows.</p></div><label className="file-button">IMPORT CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.target.files?.[0])} /></label></div>
        <div className="brand-chips">{brands.map((brand) => <span key={brand.id} className="brand-chip"><i style={{ background: brand.palette.accent }} />{brand.name}<code>{brand.id}</code></span>)}</div>
        <textarea className="csv-editor" value={csv} onChange={(event) => setCsv(event.target.value)} spellCheck={false} placeholder={csvTemplate} aria-label="Clip brief CSV" />
        <div className="csv-help"><span>Required: <code>concept</code>, <code>hook</code>, <code>keyMessage</code>, and <code>brandId</code> (or brand name).</span><button className="text-button" onClick={() => setCsv(csvTemplate)}>LOAD 2-ROW FORMAT SAMPLE</button></div>
        <div className="csv-help"><span>Formats: <code>explainer</code>, <code>demo</code>, <code>proof</code>. Proof/story needs real supplied proof.</span><span>Default duration: 25 sec.</span></div>
        <div className="creator-actions">{error && <pre className="form-error" role="alert">{error}</pre>}<button className="button" disabled={busy || !csv.trim()} onClick={() => void createBatch()}>{busy ? "VALIDATING…" : "VALIDATE & BUILD REVIEW BOARD →"}</button></div>
      </section>
    </main>
  </div>;
}
