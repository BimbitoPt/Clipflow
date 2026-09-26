"use client";

import { useEffect, useState } from "react";
import type { BrandKit, ClipBrief } from "@/src/lib/domain";
import ClipPlayer from "@/components/ClipPlayer";
import { defaultVoiceoverScript } from "@/src/lib/voiceover-script";

export default function ClipEditor({ clip, brand, onChanged }: { clip: ClipBrief; brand?: BrandKit; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState(clip);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const suggestedScript = defaultVoiceoverScript(clip);
  useEffect(() => { setDraft({ ...clip, voiceover: { ...clip.voiceover, script: clip.voiceover.script || suggestedScript } }); }, [clip, suggestedScript]);
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
      sceneCopy: draft.sceneCopy, postCopy: draft.postCopy, voiceoverScript: draft.voiceover.script, voiceId: draft.voiceover.voiceId, motionStyle: draft.motionStyle,
    });
  }
  async function generateVoiceover() {
    setBusy(true); setMessage("Generating local voiceover… first use may take a little longer.");
    try {
      const response = await fetch(`/api/batches/${clip.batchId}/clips/${clip.id}/voiceover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script: draft.voiceover.script, voiceId: draft.voiceover.voiceId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Voiceover generation failed");
      await onChanged(); setMessage(`Voiceover ready (${result.clip.voiceover.wordTimings.length} timed words).`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not generate voiceover"); }
    finally { setBusy(false); }
  }
  async function review(approved: boolean) {
    await send(`/api/batches/${clip.batchId}/clips/${clip.id}/review`, "POST", { approved });
  }

  return <aside className="clip-editor panel">
    {brand ? <ClipPlayer clip={draft} brand={brand} /> : <div className="editor-preview"><span>Loading brand kit…</span></div>}
    <div className="editor-form">
      <div className="section-heading"><h2>Clip brief</h2><span className={`status-label ${clip.status}`}>{clip.status.replace("_", " ")}</span></div>
      <label>Concept<input disabled={busy} value={draft.concept} onChange={(event) => patch({ concept: event.target.value })} /></label>
      <label>Opening hook<input disabled={busy} value={draft.hook} onChange={(event) => patch({ hook: event.target.value })} /></label>
      <label>Key message<textarea disabled={busy} rows={3} value={draft.keyMessage} onChange={(event) => patch({ keyMessage: event.target.value })} /></label>
      <label>Supporting point<input disabled={busy} value={draft.supportingPoint ?? ""} onChange={(event) => patch({ supportingPoint: event.target.value || null })} /></label>
      <label>Proof / evidence<textarea disabled={busy} rows={2} value={draft.proof ?? ""} onChange={(event) => patch({ proof: event.target.value || null })} placeholder="Required for proof/story format. Use approved facts only." /></label>
      <div className="inline-fields"><label>Format<select disabled={busy} value={draft.format} onChange={(event) => patch({ format: event.target.value as ClipBrief["format"] })}><option value="explainer">Animated explainer</option><option value="demo">Product demo</option><option value="proof">Proof / story</option></select></label><label>Duration<input disabled={busy} type="number" min={10} max={60} value={draft.durationSeconds} onChange={(event) => patch({ durationSeconds: Number(event.target.value) })} /></label></div>
      <div className="inline-fields"><label>Motion style<select disabled={busy} value={draft.motionStyle} onChange={(event) => patch({ motionStyle: event.target.value as ClipBrief["motionStyle"] })}><option value="kinetic">Kinetic type</option><option value="float">Soft float</option><option value="snap">Punchy snap</option><option value="cinematic">Cinematic drift</option></select></label><label>Voice track<small>{clip.voiceover.audioPath ? "READY" : "NOT GENERATED"}</small></label></div>
      <label>Voice <small>Local Kokoro</small><select disabled={busy} value={draft.voiceover.voiceId} onChange={(event) => patch({ voiceover: { ...draft.voiceover, voiceId: event.target.value as ClipBrief["voiceover"]["voiceId"] } })}><option value="af_heart">Heart · warm female</option><option value="af_bella">Bella · energetic female</option><option value="am_michael">Michael · male</option></select></label>
      <label>Voiceover script <small>Up to 900 characters</small><textarea disabled={busy} rows={5} value={draft.voiceover.script} onChange={(event) => patch({ voiceover: { ...draft.voiceover, script: event.target.value } })} placeholder="Write the narration to be spoken…" /></label>
      <div className="voiceover-actions"><button className="button secondary" type="button" disabled={busy || clip.status === "rendering" || !draft.voiceover.script.trim()} onClick={() => void generateVoiceover()}>{busy ? "WORKING…" : clip.voiceover.audioPath ? "REGENERATE VOICEOVER" : "GENERATE VOICEOVER"}</button>{clip.voiceover.audioPath && <audio controls preload="none" src={`/${clip.voiceover.audioPath}`} />}</div>
      <label>Call to action<input disabled={busy} value={draft.cta} onChange={(event) => patch({ cta: event.target.value })} /></label>
      <label>Scene copy <small>One scene per line</small><textarea disabled={busy} rows={4} value={draft.sceneCopy.join("\n")} onChange={(event) => patch({ sceneCopy: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })} /></label>
      <label>Post copy<textarea disabled={busy} rows={4} value={draft.postCopy} onChange={(event) => patch({ postCopy: event.target.value })} /></label>
      {clip.status === "failed" && <p className="render-failure" role="alert">Render failed: {clip.renderError ?? "Unknown error"}</p>}
      {clip.status === "rendered" && <div className="download-pair"><a href={`/api/renders/${clip.id}?batchId=${clip.batchId}&asset=video`}>↓ DOWNLOAD MP4</a><a href={`/api/renders/${clip.id}?batchId=${clip.batchId}&asset=cover`}>↓ COVER PNG</a></div>}
      {message && <p className="editor-message" role="status">{message}</p>}
      <div className="editor-actions"><button className="button secondary" disabled={busy || clip.status === "rendering"} onClick={() => void save()}>SAVE EDITS</button><button className="button" disabled={busy || clip.status === "rendering"} onClick={() => void review(clip.status !== "approved" && clip.status !== "rendered")}>{busy ? "SAVING…" : clip.status === "approved" || clip.status === "rendered" ? "REMOVE APPROVAL" : "APPROVE CLIP"}</button></div>
    </div>
  </aside>;
}
