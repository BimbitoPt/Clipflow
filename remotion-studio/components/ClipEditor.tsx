"use client";

import { useEffect, useState } from "react";
import type { BrandKit, ClipBrief } from "@/src/lib/domain";

export default function ClipEditor({ clip, brand, onChanged }: { clip: ClipBrief; brand?: BrandKit; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState(clip);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setDraft(clip); }, [clip]);
  const patch = (value: Partial<ClipBrief>) => setDraft((current) => ({ ...current, ...value }));

  async function send(path: string, method: string, body: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? (result.errors ?? []).join("\n") ?? "Request failed");
      await onChanged(); setMessage("Saved to this batch.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save changes"); }
    finally { setBusy(false); }
  }

  async function save() {
    await send(`/api/batches/${clip.batchId}/clips/${clip.id}`, "PUT", {
      concept: draft.concept, hook: draft.hook, keyMessage: draft.keyMessage, supportingPoint: draft.supportingPoint,
      proof: draft.proof, cta: draft.cta, format: draft.format, durationSeconds: draft.durationSeconds,
      sceneCopy: draft.sceneCopy, postCopy: draft.postCopy,
    });
  }
  async function review(approved: boolean) {
    await send(`/api/batches/${clip.batchId}/clips/${clip.id}/review`, "POST", { approved });
  }

  return <aside className="clip-editor panel">
    <div className="editor-preview" style={{ background: `radial-gradient(circle at 75% 20%, ${brand?.palette.accent ?? "#246BFD"}70, transparent 34%), linear-gradient(160deg, ${brand?.palette.background ?? "#080A0D"}, #161d27)` }}>
      <span className="eyebrow">{brand?.name ?? clip.brandId} / {clip.format}</span><h2>{draft.hook}</h2><p>{draft.keyMessage}</p><span className="editor-cta" style={{ background: brand?.palette.accentAlt ?? "#CFFF47", color: brand?.palette.background ?? "#080A0D" }}>{draft.cta}</span>
      <span className="preview-caption">PREVIEW COMING NEXT</span>
    </div>
    <div className="editor-form">
      <div className="section-heading"><h2>Clip brief</h2><span className={`status-label ${clip.status}`}>{clip.status.replace("_", " ")}</span></div>
      <label>Concept<input value={draft.concept} onChange={(event) => patch({ concept: event.target.value })} /></label>
      <label>Opening hook<input value={draft.hook} onChange={(event) => patch({ hook: event.target.value })} /></label>
      <label>Key message<textarea rows={3} value={draft.keyMessage} onChange={(event) => patch({ keyMessage: event.target.value })} /></label>
      <label>Supporting point<input value={draft.supportingPoint ?? ""} onChange={(event) => patch({ supportingPoint: event.target.value || null })} /></label>
      <label>Proof / evidence<textarea rows={2} value={draft.proof ?? ""} onChange={(event) => patch({ proof: event.target.value || null })} placeholder="Required for proof/story format. Use approved facts only." /></label>
      <div className="inline-fields"><label>Format<select value={draft.format} onChange={(event) => patch({ format: event.target.value as ClipBrief["format"] })}><option value="explainer">Animated explainer</option><option value="demo">Product demo</option><option value="proof">Proof / story</option></select></label><label>Duration<input type="number" min={10} max={60} value={draft.durationSeconds} onChange={(event) => patch({ durationSeconds: Number(event.target.value) })} /></label></div>
      <label>Call to action<input value={draft.cta} onChange={(event) => patch({ cta: event.target.value })} /></label>
      <label>Scene copy <small>One scene per line</small><textarea rows={4} value={draft.sceneCopy.join("\n")} onChange={(event) => patch({ sceneCopy: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })} /></label>
      <label>Post copy<textarea rows={4} value={draft.postCopy} onChange={(event) => patch({ postCopy: event.target.value })} /></label>
      {message && <p className="editor-message" role="status">{message}</p>}
      <div className="editor-actions"><button className="button secondary" disabled={busy || clip.status === "rendering"} onClick={() => void save()}>SAVE EDITS</button><button className="button" disabled={busy || clip.status === "rendering"} onClick={() => void review(clip.status !== "approved" && clip.status !== "rendered")}>{busy ? "SAVING…" : clip.status === "approved" || clip.status === "rendered" ? "REMOVE APPROVAL" : "APPROVE CLIP"}</button></div>
    </div>
  </aside>;
}
