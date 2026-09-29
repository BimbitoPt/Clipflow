"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandKit } from "@/src/lib/domain";
import { blankBrief, validateGuidedBriefs, type BriefIssue, type GuidedBrief } from "@/src/lib/guided-briefs";

const csvTemplate = [
  "brandId,concept,hook,keyMessage,supportingPoint,proof,cta,format,durationSeconds,postCopy",
  "clipflow,One idea to finished video,What if the first draft took minutes?,Clipflow turns a short brief into a vertical video.,Script and motion in one workflow,,,demo,20,Idea in motion.",
  "mstudio,Website conversion,Your website should explain the offer.,A clear website helps visitors understand what you sell.,,Use only verified brand facts,See the pricing page,explainer,20,",
].join("\n");

type Mode = "guided" | "csv";

export default function BatchCreator() {
  const router = useRouter();
  const [name, setName] = useState(() => `Marketing batch / ${new Date().toLocaleDateString()}`);
  const [mode, setMode] = useState<Mode>("guided");
  const [rows, setRows] = useState<GuidedBrief[]>(() => Array.from({ length: 10 }, () => blankBrief()));
  const [openRow, setOpenRow] = useState(0);
  const [issues, setIssues] = useState<BriefIssue[]>([]);
  const [csv, setCsv] = useState("");
  const [brands, setBrands] = useState<BrandKit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const complete = useMemo(() => rows.filter((row) => row.brandId && row.concept.trim() && row.hook.trim() && row.keyMessage.trim() && (row.format !== "proof" || row.proof.trim())).length, [rows]);

  useEffect(() => {
    void fetch("/api/brands").then((response) => response.json()).then((result) => {
      const loaded: BrandKit[] = result.brands ?? [];
      setBrands(loaded);
      if (loaded[0]) setRows((current) => current.map((row) => row.brandId ? row : { ...row, brandId: loaded[0].id }));
    }).catch(() => setError("Could not load brand kits. Reload this page to try again."));
  }, []);

  function patchRow(index: number, patch: Partial<GuidedBrief>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    setIssues((current) => current.filter((issue) => issue.index !== index));
  }

  function chooseMode(next: Mode) {
    setMode(next);
    setError("");
    setIssues([]);
  }

  async function createBatch() {
    setError("");
    if (!name.trim()) { setError("Give this batch a name before continuing."); return; }
    if (mode === "guided") {
      const found = validateGuidedBriefs(rows);
      setIssues(found);
      if (found.length) { setOpenRow(Math.max(0, found[0].index)); setError(`Complete the highlighted briefs before creating the batch (${found.length} fields need attention).`); return; }
    } else if (!csv.trim()) { setError("Paste CSV or import a file to continue."); return; }
    setBusy(true);
    try {
      const body = mode === "guided" ? { name, briefs: rows } : { name, csv };
      const response = await fetch("/api/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error([result.error, ...(result.errors ?? [])].filter(Boolean).join("\n"));
      router.push(`/batches/${result.batch.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create batch."); }
    finally { setBusy(false); }
  }

  async function readFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Choose a .csv file."); return; }
    setCsv(await file.text()); setError(""); setMode("csv");
  }

  return <div className="studio-shell">
    <aside className="sidebar"><a className="brand-mark" href="/"><span className="brand-glyph">▶</span><span>CLIPFLOW <span className="brand-submark">REMOTION</span></span></a><nav className="nav-list"><a className="nav-item" href="/">Studio</a><a className="nav-item" href="/brands">Brand kits</a></nav><div className="sidebar-foot">LOCAL PRODUCTION</div></aside>
    <main className="main creator-main">
      <div className="topline"><a className="eyebrow" href="/">← STUDIO</a><span className="status-pill">NEW BATCH · 10–20 CLIPS</span></div>
      <header className="creator-heading"><div><span className="eyebrow">START A PRODUCTION RUN</span><h1>Build the next batch.</h1><p className="subtle">Give each idea a clear hook. You can refine the story, voice, and visuals before anything renders.</p></div>{mode === "guided" && <div className="creator-count"><strong>{complete}<span> / {rows.length}</span></strong><small>BRIEFS READY</small></div>}</header>
      <div className="creator-topbar"><label className="creator-name">Batch name<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label><div className="mode-switch" role="group" aria-label="Brief entry mode"><button type="button" className={mode === "guided" ? "active" : ""} onClick={() => chooseMode("guided")}>GUIDED</button><button type="button" className={mode === "csv" ? "active" : ""} onClick={() => chooseMode("csv")}>CSV IMPORT</button></div></div>
      {mode === "guided" ? <section className="guided-creator" aria-label="Clip briefs">
        <div className="guided-intro"><div><h2>Clip briefs</h2><p>Start with the essentials. Open a brief to add proof, format, and publishing copy.</p></div><span className="status-pill">{rows.length} OF 20 SLOTS</span></div>
        <div className="brief-list">{rows.map((row, index) => {
          const rowIssues = issues.filter((issue) => issue.index === index);
          const expanded = openRow === index;
          const brand = brands.find((item) => item.id === row.brandId);
          return <article className={`brief-row ${expanded ? "expanded" : ""} ${rowIssues.length ? "has-issues" : ""}`} key={index}>
            <button className="brief-row-head" type="button" onClick={() => setOpenRow(expanded ? -1 : index)} aria-expanded={expanded}>
              <span className="brief-number">{String(index + 1).padStart(2, "0")}</span><span className="brief-row-title"><strong>{row.concept.trim() || "Untitled clip"}</strong><small>{row.hook.trim() || "Add a hook that stops the scroll"}</small></span><span className="brief-row-brand" style={{ color: brand?.palette.accent ?? "var(--muted)" }}>{brand?.name ?? "Choose brand"}</span><span className={`brief-row-state ${rowIssues.length ? "invalid" : row.concept && row.hook && row.keyMessage && (row.format !== "proof" || row.proof) ? "ready" : ""}`}>{rowIssues.length ? `${rowIssues.length} TO FIX` : row.concept && row.hook && row.keyMessage && (row.format !== "proof" || row.proof) ? "READY" : "DRAFT"}</span><span className="brief-chevron">{expanded ? "−" : "+"}</span>
            </button>
            {expanded && <div className="brief-row-body">
              <div className="brief-field-grid"><label>Brand<select value={row.brandId} onChange={(event) => patchRow(index, { brandId: event.target.value })}>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Concept<input value={row.concept} maxLength={180} onChange={(event) => patchRow(index, { concept: event.target.value })} placeholder="What is this clip about?" /></label></div>
              <label>Opening hook<input value={row.hook} maxLength={180} onChange={(event) => patchRow(index, { hook: event.target.value })} placeholder="A specific first line people will stop for" /></label>
              <label>Key message<textarea value={row.keyMessage} maxLength={500} rows={2} onChange={(event) => patchRow(index, { keyMessage: event.target.value })} placeholder="What should viewers understand by the end?" /></label>
              <details className="brief-more"><summary>More direction <span>proof, CTA, format, duration</span></summary><div className="brief-more-fields"><label>Supporting point<input value={row.supportingPoint} maxLength={400} onChange={(event) => patchRow(index, { supportingPoint: event.target.value })} /></label><label>Proof / evidence<textarea value={row.proof} maxLength={500} rows={2} onChange={(event) => patchRow(index, { proof: event.target.value })} placeholder="Use verified claims or approved material" /></label><label>Call to action<input value={row.cta} maxLength={180} onChange={(event) => patchRow(index, { cta: event.target.value })} placeholder="What should viewers do next?" /></label><div className="brief-field-grid"><label>Format<select value={row.format} onChange={(event) => patchRow(index, { format: event.target.value as GuidedBrief["format"] })}><option value="demo">Product demo</option><option value="explainer">Animated explainer</option><option value="proof">Proof / story</option></select></label><label>Target length (seconds)<input type="number" min={10} max={60} value={row.durationSeconds} onChange={(event) => patchRow(index, { durationSeconds: Number(event.target.value) })} /></label></div><label>Post copy<textarea value={row.postCopy} maxLength={1200} rows={3} onChange={(event) => patchRow(index, { postCopy: event.target.value })} /></label></div></details>
              {rowIssues.length > 0 && <div className="brief-issues" role="alert">{rowIssues.map((issue) => <span key={issue.field}>{issue.message}</span>)}</div>}
              <div className="brief-row-actions"><button type="button" className="text-button" disabled={rows.length >= 20} onClick={() => { setRows((current) => [...current.slice(0, index + 1), { ...row }, ...current.slice(index + 1)]); setIssues([]); setOpenRow(index + 1); }}>DUPLICATE BRIEF</button><button type="button" className="text-button remove" disabled={rows.length <= 10} onClick={() => { setRows((current) => current.filter((_, rowIndex) => rowIndex !== index)); setIssues([]); setOpenRow(Math.max(0, index - 1)); }}>REMOVE</button></div>
            </div>}
          </article>;
        })}</div>
        <button type="button" className="add-brief" disabled={rows.length >= 20} onClick={() => { setRows((current) => [...current, blankBrief(brands[0]?.id)]); setIssues([]); setOpenRow(rows.length); }}>＋ ADD ANOTHER CLIP <span>UP TO 20</span></button>
      </section> : <section className="panel creator-panel"><div className="import-title"><div><h2>Import briefs</h2><p>Paste CSV or choose a .csv file with 10–20 rows.</p></div><label className="file-button">CHOOSE CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.target.files?.[0])} /></label></div><div className="brand-chips">{brands.map((brand) => <span key={brand.id} className="brand-chip"><i style={{ background: brand.palette.accent }} />{brand.name}<code>{brand.id}</code></span>)}</div><textarea className="csv-editor" value={csv} onChange={(event) => setCsv(event.target.value)} spellCheck={false} placeholder={csvTemplate} aria-label="Clip brief CSV" /><div className="csv-help"><span>Required: concept, hook, keyMessage, brandId or brand name.</span><button className="text-button" type="button" onClick={() => setCsv(csvTemplate)}>LOAD FORMAT SAMPLE</button></div></section>}
      <div className="creator-submit">{error && <p className="form-error" role="alert">{error}</p>}<button className="button" disabled={busy || !brands.length || (mode === "csv" && !csv.trim())} onClick={() => void createBatch()}>{busy ? "CREATING BATCH…" : "CREATE REVIEW BOARD →"}</button></div>
    </main>
  </div>;
}
