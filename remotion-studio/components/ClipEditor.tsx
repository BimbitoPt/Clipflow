"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import type { BrandKit, ClipBrief, MotionIntent } from "@/src/lib/domain";
import { makeScenePlan } from "@/src/lib/scene-plan";
import { defaultVoiceoverScript } from "@/src/lib/voiceover-script";
import ClipPlayer from "@/components/ClipPlayer";
import { VISUAL_EFFECTS, visualEffectLabels } from "../../shared/visual-effects";

type Tab = "story" | "visuals" | "voice" | "publish";
export type ClipEditorHandle = { save: () => Promise<boolean> };
type Props = { clip: ClipBrief; brand?: BrandKit; onChanged: () => Promise<void>; onDirtyChange: (dirty: boolean) => void };

function editPayload(draft: ClipBrief) {
  return {
    concept: draft.concept, hook: draft.hook, keyMessage: draft.keyMessage, supportingPoint: draft.supportingPoint,
    proof: draft.proof, cta: draft.cta, format: draft.format, durationSeconds: draft.durationSeconds,
    sceneCopy: draft.sceneCopy, postCopy: draft.postCopy, voiceoverScript: draft.voiceover.script,
    voiceId: draft.voiceover.voiceId, motionStyle: draft.motionStyle, visualEffect: draft.visualEffect,
    sceneMotionIntents: draft.creative?.scenes.map((scene) => scene.motionIntent ?? null) ?? [],
    sceneEvidenceApprovals: draft.creative?.scenes.map((scene) => scene.evidenceApproved ?? false) ?? [],
  };
}

const ClipEditor = forwardRef<ClipEditorHandle, Props>(function ClipEditor({ clip, brand, onChanged, onDirtyChange }, ref) {
  const suggestedScript = defaultVoiceoverScript(clip);
  const baseline = useMemo(() => ({ ...clip, voiceover: { ...clip.voiceover, script: clip.voiceover.script || suggestedScript } }), [clip, suggestedScript]);
  const [draft, setDraft] = useState<ClipBrief>(baseline);
  const [tab, setTab] = useState<Tab>("story");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const playerRef = useRef<PlayerRef>(null);
  const previousBaseline = useRef(baseline);
  const dirty = JSON.stringify(editPayload(draft)) !== JSON.stringify(editPayload(baseline));
  const scenes = useMemo(() => makeScenePlan(draft).scenes, [draft]);

  useEffect(() => {
    const prior = previousBaseline.current;
    setDraft((current) => JSON.stringify(editPayload(current)) === JSON.stringify(editPayload(prior)) ? baseline : current);
    previousBaseline.current = baseline;
  }, [baseline]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  function patch(value: Partial<ClipBrief>) { setDraft((current) => ({ ...current, ...value })); setMessage(""); }
  function patchScene(index: number, copy: string) { patch({ sceneCopy: draft.sceneCopy.map((item, itemIndex) => itemIndex === index ? copy : item) }); }
  function patchSceneMotionIntent(index: number, value: string) {
    if (!draft.creative) return;
    const motionIntent = value === "legacy" ? undefined : value as MotionIntent;
    patch({ creative: { ...draft.creative, scenes: draft.creative.scenes.map((scene, sceneIndex) => sceneIndex === index ? { ...scene, motionIntent } : scene) } });
  }
  function patchSceneEvidenceApproval(index: number, approved: boolean) {
    if (!draft.creative) return;
    patch({ creative: { ...draft.creative, scenes: draft.creative.scenes.map((scene, sceneIndex) => sceneIndex === index ? { ...scene, evidenceApproved: approved } : scene) } });
  }

  async function send(path: string, method: string, body: unknown, success: string): Promise<boolean> {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? (result.errors ?? []).join("\n") ?? "Request failed");
      if (result.clip) setDraft(result.clip);
      await onChanged(); setMessage(success); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save changes"); return false; }
    finally { setBusy(false); }
  }

  async function save(): Promise<boolean> {
    return send(`/api/batches/${clip.batchId}/clips/${clip.id}`, "PUT", editPayload(draft), "Saved to this batch.");
  }
  useImperativeHandle(ref, () => ({ save }));

  async function generateVoiceover() {
    if (dirty && !(await save())) return;
    setBusy(true); setMessage("Generating a local voice track…");
    try {
      const response = await fetch(`/api/batches/${clip.batchId}/clips/${clip.id}/voiceover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script: draft.voiceover.script, voiceId: draft.voiceover.voiceId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Voiceover generation failed");
      setDraft(result.clip);
      await onChanged(); setMessage(`Voiceover ready (${result.clip.voiceover.wordTimings.length} timed words).`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not generate voiceover"); }
    finally { setBusy(false); }
  }

  async function review() {
    if (dirty && !(await save())) return;
    const approved = dirty || (clip.status !== "approved" && clip.status !== "rendered");
    await send(`/api/batches/${clip.batchId}/clips/${clip.id}/review`, "POST", { approved }, approved ? "Clip approved for render." : "Clip returned to review.");
  }

  return <section className="clip-editor" aria-label="Selected clip editor">
    <div className="clip-preview-column">
      <div className="clip-preview-top"><span className="eyebrow">LIVE COMPOSITION</span><span className={`status-label ${clip.status}`}>{clip.status.replace("_", " ")}</span></div>
      {brand ? <ClipPlayer clip={draft} brand={brand} playerRef={playerRef} /> : <div className="editor-preview"><span>Loading brand kit…</span></div>}
      <div className="preview-foot"><strong>9:16 PREVIEW</strong><span>{draft.durationSeconds}s · {draft.sceneCopy.length} scenes</span></div>
      <div className="scene-seeker" aria-label="Scenes in this clip">{scenes.map((scene) => <button key={scene.index} type="button" onClick={() => playerRef.current?.seekTo(scene.startFrame)} aria-label={`Jump to scene ${scene.index + 1}: ${scene.copy}`}><span>{String(scene.index + 1).padStart(2, "0")}</span><strong>{scene.copy}</strong></button>)}</div>
    </div>
    <div className="clip-inspector">
      <div className="inspector-header"><div><span className="eyebrow">{brand?.name ?? draft.brandId} / CLIP BRIEF</span><h2>{draft.concept}</h2></div><span className={`status-label ${clip.status}`}>{clip.status.replace("_", " ")}</span></div>
      <div className="inspector-tabs" role="tablist" aria-label="Clip editing sections">{(["story", "visuals", "voice", "publish"] as Tab[]).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item.toUpperCase()}</button>)}</div>
      <div className="inspector-body">
        {tab === "story" && <div className="inspector-fields" role="tabpanel">
          <p className="inspector-hint">Shape the idea viewers will remember. The scene text can be tuned under Visuals.</p>
          <label>Concept<input disabled={busy} value={draft.concept} maxLength={180} onChange={(event) => patch({ concept: event.target.value })} /></label>
          <label>Opening hook<input disabled={busy} value={draft.hook} maxLength={180} onChange={(event) => patch({ hook: event.target.value })} /></label>
          <label>Key message<textarea disabled={busy} rows={3} value={draft.keyMessage} maxLength={500} onChange={(event) => patch({ keyMessage: event.target.value })} /></label>
          <label>Supporting point<input disabled={busy} value={draft.supportingPoint ?? ""} maxLength={400} onChange={(event) => patch({ supportingPoint: event.target.value || null })} /></label>
          <label>Proof / evidence<textarea disabled={busy} rows={2} value={draft.proof ?? ""} maxLength={500} onChange={(event) => patch({ proof: event.target.value || null })} placeholder="Use verified claims and approved footage only." /></label>
          <label>Call to action<input disabled={busy} value={draft.cta} maxLength={180} onChange={(event) => patch({ cta: event.target.value })} /></label>
          <div className="inspector-field-pair"><label>Format<select disabled={busy} value={draft.format} onChange={(event) => patch({ format: event.target.value as ClipBrief["format"] })}><option value="explainer">Explainer</option><option value="demo">Product demo</option><option value="proof">Proof / story</option></select></label><label>Length (seconds)<input disabled={busy} type="number" min={10} max={60} value={draft.durationSeconds} onChange={(event) => patch({ durationSeconds: Math.max(10, Math.min(60, Number(event.target.value) || 10)) })} /></label></div>
        </div>}
        {tab === "visuals" && <div className="inspector-fields" role="tabpanel">
          <p className="inspector-hint">Motion follows the story beat. Use real approved screens for evidence; without one, the renderer uses an explanatory graphic.</p>
          <div className="treatment-summary"><span className="eyebrow">TREATMENT</span><strong>{draft.creative?.template.replace(/-/g, " ") ?? "Brand storyboard"}</strong><small>{draft.creative?.musicPath ? "Music bed" : "No music"} · {draft.creative?.captionCues.length ? "Timed captions" : "Default captions"}</small></div>
          <label>Motion style<select disabled={busy} value={draft.motionStyle} onChange={(event) => patch({ motionStyle: event.target.value as ClipBrief["motionStyle"] })}><option value="kinetic">Kinetic type</option><option value="float">Soft float</option><option value="snap">Punchy snap</option><option value="cinematic">Cinematic drift</option></select></label>
          <label>Visual effect<select disabled={busy} value={draft.visualEffect} onChange={(event) => patch({ visualEffect: event.target.value as ClipBrief["visualEffect"] })}>{VISUAL_EFFECTS.map(effect => <option key={effect} value={effect}>{visualEffectLabels[effect]}</option>)}</select></label>
          <div className="scene-controls">{scenes.map((scene) => {
            const image = scene.screen?.imagePath ?? scene.bg?.imagePath;
            const creativeScene = draft.creative?.scenes[scene.index];
            const motionValue = creativeScene?.motionIntent ?? "legacy";
            return <div className="scene-control" key={scene.index}><button type="button" onClick={() => playerRef.current?.seekTo(scene.startFrame)} className="scene-control-thumb" aria-label={`Preview scene ${scene.index + 1}`}>{image ? <img src={`/${image}`} alt="" /> : <span>{String(scene.index + 1).padStart(2, "0")}</span>}</button><div><span className="scene-control-meta">SCENE {String(scene.index + 1).padStart(2, "0")} · {(scene.durationInFrames / 30).toFixed(1)}s</span><label>On-screen text<textarea disabled={busy} rows={2} maxLength={220} value={draft.sceneCopy[scene.index] ?? ""} onChange={(event) => patchScene(scene.index, event.target.value)} /></label><label>Motion intent<select disabled={busy || !draft.creative} value={motionValue} onChange={(event) => patchSceneMotionIntent(scene.index, event.target.value)}><option value="legacy">Existing treatment</option><option value="auto">Adapt to this video</option><option value="kinetic-type">Animated typography</option><option value="focus">Subject focus</option><option value="metric">Stated metric</option><option value="none">Footage only</option><option value="transform">Transform</option><option value="sequence">Sequence</option><option value="comparison">Comparison</option><option value="evidence-reveal" disabled={!scene.screen || !creativeScene?.evidenceApproved}>Evidence reveal</option><option value="payoff">Payoff</option></select></label>{scene.screen && <label className="scene-evidence-approval"><input type="checkbox" disabled={busy} checked={creativeScene?.evidenceApproved ?? false} onChange={(event) => patchSceneEvidenceApproval(scene.index, event.target.checked)} />Approved for use as evidence</label>}<small>{scene.motionIntent ? `Resolved: ${scene.motionIntent.replace(/-/g, " ")}${scene.motionReason ? ` · ${scene.motionReason}` : ""}` : "Existing motion treatment"}{scene.screen ? ` · ${scene.screen.imagePath.split("/").at(-1)}` : scene.bg ? " · Cinematic still" : scene.visual ? " · Motion graphic" : " · Branded backdrop"}</small></div></div>;
          })}</div>
        </div>}
        {tab === "voice" && <div className="inspector-fields" role="tabpanel">
          <p className="inspector-hint">Write narration for the whole clip. Generate a local track, then listen before approval.</p>
          <label>Voice <small>Local Kokoro</small><select disabled={busy} value={draft.voiceover.voiceId} onChange={(event) => patch({ voiceover: { ...draft.voiceover, voiceId: event.target.value as ClipBrief["voiceover"]["voiceId"] } })}><option value="af_heart">Heart · warm female</option><option value="af_bella">Bella · energetic female</option><option value="am_michael">Michael · male</option></select></label>
          <label>Voiceover script <small>Up to 900 characters</small><textarea disabled={busy} rows={8} maxLength={900} value={draft.voiceover.script} onChange={(event) => patch({ voiceover: { ...draft.voiceover, script: event.target.value } })} /></label>
          <button className="button secondary" type="button" disabled={busy || clip.status === "rendering" || !draft.voiceover.script.trim()} onClick={() => void generateVoiceover()}>{busy ? "WORKING…" : clip.voiceover.audioPath ? "REGENERATE VOICEOVER" : "GENERATE VOICEOVER"}</button>
          {clip.voiceover.audioPath ? <audio controls preload="none" src={`/${clip.voiceover.audioPath}`} /> : <p className="voice-empty">No voice track yet. The preview will use the visual composition until one is generated.</p>}
        </div>}
        {tab === "publish" && <div className="inspector-fields" role="tabpanel">
          <p className="inspector-hint">Check platform copy and download the rendered master and cover.</p>
          <label>Post copy<textarea disabled={busy} rows={8} maxLength={1200} value={draft.postCopy} onChange={(event) => patch({ postCopy: event.target.value })} /></label>
          {clip.status === "rendered" && <div className="download-pair"><a href={`/api/renders/${clip.id}?batchId=${clip.batchId}&asset=video`}>↓ DOWNLOAD MP4</a><a href={`/api/renders/${clip.id}?batchId=${clip.batchId}&asset=cover`}>↓ COVER PNG</a></div>}
          {clip.status !== "rendered" && <p className="voice-empty">Downloads appear here after this clip renders.</p>}
        </div>}
      </div>
      {clip.status === "failed" && <p className="render-failure" role="alert">Render failed: {clip.renderError ?? "Unknown error"}</p>}
      {message && <p className="editor-message inspector-message" role="status">{message}</p>}
      <div className="inspector-actions"><span className={dirty ? "dirty-indicator" : "saved-indicator"}>{dirty ? "UNSAVED CHANGES" : "SAVED TO BATCH"}</span><button className="button secondary" disabled={busy || clip.status === "rendering" || !dirty} onClick={() => void save()}>SAVE EDITS</button><button className="button" disabled={busy || clip.status === "rendering"} onClick={() => void review()}>{busy ? "WORKING…" : dirty ? "SAVE & APPROVE" : clip.status === "approved" || clip.status === "rendered" ? "RETURN TO REVIEW" : "APPROVE CLIP"}</button></div>
    </div>
  </section>;
});

export default ClipEditor;
