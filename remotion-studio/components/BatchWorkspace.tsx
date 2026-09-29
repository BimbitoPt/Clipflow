"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Batch, BrandKit, ClipBrief } from "@/src/lib/domain";
import ClipReviewGrid from "@/components/ClipReviewGrid";
import ClipEditor, { type ClipEditorHandle } from "@/components/ClipEditor";
import RenderProgress from "@/components/RenderProgress";
import ExportBatchButton from "@/components/ExportBatchButton";

type BatchPayload = { batch: Batch; clips: ClipBrief[] };

export default function BatchWorkspace({ batchId }: { batchId: string }) {
  const [data, setData] = useState<BatchPayload | null>(null);
  const [brands, setBrands] = useState<BrandKit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [renderBusy, setRenderBusy] = useState(false);
  const [voiceoverBusy, setVoiceoverBusy] = useState(false);
  const [voiceoverMessage, setVoiceoverMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingSelectedId, setPendingSelectedId] = useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);
  const switchBusyRef = useRef(false);
  switchBusyRef.current = switchBusy;
  const editorRef = useRef<ClipEditorHandle>(null);
  const switchDialogRef = useRef<HTMLDivElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
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
  useEffect(() => {
    if (!pendingSelectedId) return;
    const previousFocus = document.activeElement;
    keepEditingRef.current?.focus();
    function handleDialogKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); if (!switchBusyRef.current) setPendingSelectedId(null); return; }
      if (event.key !== "Tab") return;
      const buttons = Array.from(switchDialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleDialogKey);
    return () => {
      document.removeEventListener("keydown", handleDialogKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [pendingSelectedId]);
  const selected = data?.clips.find((clip) => clip.id === selectedId) ?? null;
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const counts = {
    review: data?.clips.filter((clip) => clip.status === "needs_review" || clip.status === "draft").length ?? 0,
    approved: data?.clips.filter((clip) => clip.status === "approved").length ?? 0,
    rendering: data?.clips.filter((clip) => clip.status === "rendering").length ?? 0,
    rendered: data?.clips.filter((clip) => clip.status === "rendered").length ?? 0,
    failed: data?.clips.filter((clip) => clip.status === "failed").length ?? 0,
    missingVoice: data?.clips.filter((clip) => !clip.voiceover.audioPath && clip.status !== "rendering").length ?? 0,
  };
  const nextAction = counts.review || counts.failed ? "review" : counts.missingVoice ? "voice" : counts.approved ? "render" : "export";

  function selectClip(id: string) {
    if (id === selectedId) return;
    if (dirty) { setPendingSelectedId(id); return; }
    setSelectedId(id);
  }

  async function saveAndSwitch() {
    if (!pendingSelectedId) return;
    setSwitchBusy(true);
    const saved = await editorRef.current?.save();
    setSwitchBusy(false);
    if (saved) { setDirty(false); setSelectedId(pendingSelectedId); setPendingSelectedId(null); }
  }

  async function renderApproved() {
    if (dirty) { setError("Save the selected clip before rendering the batch."); return; }
    setRenderBusy(true); setError("");
    try {
      const response = await fetch(`/api/batches/${batchId}/render`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not queue clips");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start render"); }
    finally { setRenderBusy(false); }
  }

  async function generateMissingVoiceovers() {
    if (dirty) { setError("Save the selected clip before generating batch voiceovers."); return; }
    setVoiceoverBusy(true); setVoiceoverMessage("Generating local voiceovers for clips without a track…"); setError("");
    try {
      const response = await fetch(`/api/batches/${batchId}/voiceovers`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not generate voiceovers");
      let job = result.job;
      while (job && (job.status === "queued" || job.status === "running")) {
        setVoiceoverMessage(`Generating local voiceovers… ${job.processed} / ${job.total} clips`);
        await new Promise((resolve) => setTimeout(resolve, 1800));
        const statusResponse = await fetch(`/api/batches/${batchId}/voiceovers`, { cache: "no-store" });
        const statusResult = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(statusResult.error ?? "Could not read voiceover progress");
        job = statusResult.job;
      }
      await refresh();
      if (job?.status === "failed") setVoiceoverMessage(job.error ?? "Voiceover generation stopped. Retry the batch to continue.");
      else setVoiceoverMessage(`Voiceovers ready: ${job?.generated ?? 0} generated, ${job?.skipped ?? 0} already ready, ${job?.failed ?? 0} need changes.`);
    } catch (reason) { setVoiceoverMessage(reason instanceof Error ? reason.message : "Could not generate voiceovers"); }
    finally { setVoiceoverBusy(false); }
  }

  return <div className="studio-shell">
    <aside className="sidebar"><a className="brand-mark" href="/"><span className="brand-glyph">▶</span><span>CLIPFLOW <span className="brand-submark">REMOTION</span></span></a><nav className="nav-list"><a className="nav-item active" href="/">Studio</a><a className="nav-item" href="/brands">Brand kits</a></nav><div className="sidebar-foot">LOCAL PRODUCTION</div></aside>
    <main className="main batch-workspace">
      <div className="topline"><a className="eyebrow" href="/">← YOUR BATCHES</a><span className="status-pill">{data?.clips.length ?? "…"} CLIPS · LOCAL BATCH</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {data && <>
        <header className="production-header"><div className="production-title"><span className="eyebrow">PRODUCTION BOARD / {new Date(data.batch.createdAt).toLocaleDateString()}</span><h1>{data.batch.name}</h1><p>Review the story and the frame before approving each render.</p></div><div className="production-metrics" aria-label="Batch status"><span><strong>{counts.review}</strong>TO REVIEW</span><span><strong>{counts.approved}</strong>APPROVED</span><span><strong>{counts.rendered}</strong>RENDERED</span></div></header>
        <div className="production-actions">
          <div className="production-next"><span className="eyebrow">NEXT STEP</span><strong>{nextAction === "review" ? "Review the clips" : nextAction === "voice" ? "Prepare the voice tracks" : nextAction === "render" ? "Render approved clips" : "Export the batch"}</strong><small>{dirty ? "Save this clip's edits before running batch actions." : nextAction === "review" ? "Open a clip, save edits, then approve it." : nextAction === "voice" ? `${counts.missingVoice} clip(s) still need narration.` : nextAction === "render" ? `${counts.approved} clip(s) are ready for the render queue.` : `${counts.rendered} finished clip(s) are ready to download.`}</small></div>
          <div className="production-buttons">
            {nextAction === "review" && <button className="button" onClick={() => { const next = data.clips.find((clip) => clip.status === "needs_review" || clip.status === "draft" || clip.status === "failed"); if (next) selectClip(next.id); document.getElementById("review-workspace")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }}>REVIEW NEXT CLIP →</button>}
            <button className={`button ${nextAction === "voice" ? "" : "secondary"}`} disabled={voiceoverBusy || !counts.missingVoice || dirty} onClick={() => void generateMissingVoiceovers()}>{voiceoverBusy ? "GENERATING VO…" : "GENERATE VOICEOVERS"}</button>
            <button className={`button ${nextAction === "render" ? "" : "secondary"}`} disabled={renderBusy || !counts.approved || dirty} onClick={() => void renderApproved()}>{renderBusy ? "QUEUEING…" : "RENDER APPROVED"}</button>
            <span className={`production-export ${nextAction === "export" ? "current" : ""}`}><ExportBatchButton batchId={batchId} clips={data.clips} disabled={dirty} /></span>
          </div>
        </div>
        {voiceoverMessage && <p className="editor-message production-message" role="status">{voiceoverMessage}</p>}
        {(counts.rendering > 0 || counts.failed > 0) && <RenderProgress clips={data.clips} />}
        <div className="mobile-clip-picker"><label htmlFor="selected-clip">SELECT CLIP</label><select id="selected-clip" value={selectedId} onChange={(event) => selectClip(event.target.value)}>{data.clips.map((clip, index) => <option key={clip.id} value={clip.id}>{String(index + 1).padStart(2, "0")} · {brandById.get(clip.brandId)?.name ?? clip.brandId} · {clip.hook}</option>)}</select></div>
        <div className="review-layout" id="review-workspace">
          <ClipReviewGrid clips={data.clips} brands={brandById} selectedId={selectedId} onSelect={selectClip} />
          {selected && <ClipEditor ref={editorRef} key={selected.id} clip={selected} brand={brandById.get(selected.brandId)} onChanged={refresh} onDirtyChange={setDirty} />}
        </div>
        {pendingSelectedId && <div className="switch-backdrop" role="presentation"><div ref={switchDialogRef} className="switch-dialog" role="dialog" aria-modal="true" aria-labelledby="switch-title"><span className="eyebrow">UNSAVED CLIP</span><h2 id="switch-title">Keep your changes?</h2><p>Save this clip before opening another, or discard the edits in this inspector.</p><div className="switch-actions"><button ref={keepEditingRef} className="button secondary" disabled={switchBusy} onClick={() => setPendingSelectedId(null)}>KEEP EDITING</button><button className="button secondary" disabled={switchBusy} onClick={() => { setDirty(false); setSelectedId(pendingSelectedId); setPendingSelectedId(null); }}>DISCARD</button><button className="button" disabled={switchBusy} onClick={() => void saveAndSwitch()}>{switchBusy ? "SAVING…" : "SAVE & SWITCH"}</button></div></div></div>}
      </>}
    </main>
  </div>;
}
