import { useEffect, useMemo, useRef, useState } from "react";
import { makeCaptionPlan, resolveCaptionMode, suggestSceneLabel } from "../shared/caption-plan";
import { loadPack, PACK_IDS, packLabel, type Theme } from "./lib/packs";
import { buildScript } from "./lib/script";
import { planWordsTimed } from "./lib/planner";
import { browserStorage as storage } from "./lib/storage";
import { readWordTiming } from "./lib/session";
import { assignAiBackgrounds } from "./lib/ai-backgrounds";
import { applyScriptOverrides, hasScriptOverrides } from "./lib/script-draft";
import { previewSpeak } from "./lib/tts";
import { desktop, nativeMediaUrl, projectFingerprint, showInFolder } from "./lib/desktop";
import ProfileSettings from "./components/ProfileSettings";
import PreviewRenderer from "./components/PreviewRenderer";
import ScriptBeats from "./components/ScriptBeats";
import SceneTray from "./components/SceneTray";
import ExportPanel from "./components/ExportPanel";
import DesktopToolbar from "./components/DesktopToolbar";
import { SAMPLE_IDEA } from "./lib/activation";
import { platformPreset } from "../shared/platform-presets";
import { nextQueueIndex, parseQueueIdeas, queuePosition } from "./lib/week-queue";
import type { PackId } from "./lib/packs";
import { copyText } from "./lib/app-utils";
import { useClipflowProject, type ProjectSaveContext } from "./hooks/useClipflowProject";
import { useExportController, type ExportContext } from "./hooks/useExportController";
import { useSceneAssets } from "./hooks/useSceneAssets";

/**
 * App composes the editor: document/project state from useClipflowProject,
 * scene media from useSceneAssets, export lifecycle from useExportController,
 * derived plan (script → timing → captions) as memos, and the page itself.
 */
export function App() {
  const [err, setErr] = useState("");
  // Export lifecycle: status, progress, messages, download/native output,
  // cancellation and the whole export run live behind the controller.
  const { status, exportMsg, exportProgress, exportUrl, voiceWarn, nativeOutput, voiceDownloadUrl, busyRef, exportAbortRef, reset: resetExport, cancel: cancelExport, runExport } = useExportController(setErr);
  const statusRef = useRef(status);
  statusRef.current = status;
  // Save-time inputs (script/captions/assets) are filled in below, after the
  // derived memos. The hook reads them only from a user action or a native
  // effect — both of which run after this render completes — but the ref is
  // still typed nullable and guarded so a future early caller gets a clear
  // error instead of a TypeError on `null`.
  const saveCtxRef = useRef<ProjectSaveContext | null>(null);

  const {
    idea, setIdea, packId, setPackId, profile, saved, onSaveProfile,
    scriptOverrides, setScriptOverrides, sceneChoices, setSceneChoices,
    selectedScene, setSelectedScene, voiceOn, setVoiceOn, captionMode, setCaptionMode,
    captionOverrides, setCaptionOverrides, platform, setPlatform, creditOn, setCreditOn,
    visualEffect, setVisualEffect, queueText, setQueueText,
    setNiche, setAudience, setOffer, setTone, setProof,
    projectBase, setProjectBase, projectPath, projectBusy, projectError, projectDirty, desktopAction,
  } = useClipflowProject({
    getSaveContext: () => saveCtxRef.current,
    onRestored: resetExport,
    setErr,
    isExporting: () => statusRef.current === "working",
    exportBusyRef: busyRef,
    exportAbortRef,
  });

  const pack = useMemo(() => loadPack(packId), [packId]);
  const theme: Theme = pack.themes[1] ?? pack.themes[0]!;
  const preset = platformPreset(platform);
  const queueIdeas = useMemo(() => parseQueueIdeas(queueText), [queueText]);
  const queueNext = nextQueueIndex(queueIdeas, idea);
  const queuePos = queuePosition(queueIdeas, idea);

  const { generatedScript, err: generatedErr } = useMemo(() => {
    try {
      return { generatedScript: projectBase?.idea === idea && projectBase.profile === projectFingerprint(profile) ? projectBase.script : buildScript(idea, profile, pack), err: "" };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return { generatedScript: null, err: m.includes("E_EMPTY_IDEA") ? "Enter your idea above." : m };
    }
  }, [idea, profile, projectBase, pack]);
  const { script, err: editErr } = useMemo(() => {
    if (!generatedScript) return { script: null, err: "" };
    try { return { script: applyScriptOverrides(generatedScript, scriptOverrides), err: "" }; }
    catch (e) { return { script: null, err: e instanceof Error ? e.message : String(e) }; }
  }, [generatedScript, scriptOverrides]);
  const scriptErr = generatedErr || editErr;

  useEffect(() => {
    setErr(scriptErr);
  }, [scriptErr]);

  const timing = useMemo(() => hasScriptOverrides(scriptOverrides) ? null : readWordTiming(storage, idea, profile), [idea, profile, scriptOverrides]);
  const words = useMemo(
    () => (script ? planWordsTimed(script, timing?.cues ?? null) : undefined),
    [script, timing],
  );
  const captionLabels = useMemo(() => script?.cues.map((cue,index) => captionOverrides[index] ?? suggestSceneLabel(cue.text)) ?? [], [script, captionOverrides]);
  const captions = useMemo(() => makeCaptionPlan({ mode: captionMode, voiceOn, labels: captionLabels, words,
    scenes: script?.cues.map((cue,index) => ({ ...cue, ...timing?.windows?.[index] })) ?? [],
  }), [script, timing, captionMode, voiceOn, captionLabels, words]);
  const editingSceneLabels = resolveCaptionMode(captionMode, voiceOn, script?.cues.map(cue => cue.text).join(" ")) === "scene";

  const aiSuggestions = useMemo(() => assignAiBackgrounds(idea, profile, generatedScript?.cues.map((cue) => cue.text) ?? []), [idea, profile, generatedScript]);
  // Scene media: resolved assets, uploads/generated caches, thumbnails, GC and
  // script-driven keyframe generation.
  const { sceneAssets, assetLoading, loadSceneAsset, onUpload, sceneThumb, keyframeStatus, generateKeyframeNow, pollinationsKey, onPollinationsKeyChange } =
    useSceneAssets({ sceneChoices, setSceneChoices, selectedScene, setErr, aiSuggestions, generatedScript, profile, idea });

  // Export inputs, resolved at click time so the controller never sees a
  // stale closure over script/captions/choices.
  const exportCtx: ExportContext = { script, theme, captionAnchor: preset.captionAnchor, visualEffect, captions, words, captionLabels, captionMode, voiceOn, creditOn, timing, sceneChoices, aiSuggestions, loadSceneAsset };
  // Save inputs for the project hook (read only when save/new runs).
  saveCtxRef.current = { script, generatedScript, theme, captions, timing, sceneAssets };

  const tiktok = script ? `${script.hook} ${pack.hashtags.join(" ")}` : "";
  const xpost = script ? `${script.hook} ${script.cta}`.slice(0, 280) : "";

  const sceneLabels = ["HOOK", "BEAT 01", "BEAT 02", "BEAT 03", "CTA"];
  const isWorking = status === "working" || projectBusy;
  return (
    <main className="cf-app">
      <div className="cf-shell">
        <header className="cf-header">
          <a href={desktop ? "#idea" : "/"} className="cf-brand" aria-label="Clipflow home"><img className="cf-brand-mark" src="/brand/mark.png" alt="" /><span>CLIPFLOW</span></a>
          <span className="cf-header-label">IDEA → VIDEO STUDIO</span>
          <span className="cf-local-pill"><span /> LOCAL-FIRST</span>
        </header>
        {desktop && <DesktopToolbar path={projectPath} dirty={projectDirty} busy={projectBusy || status === "working"} error={projectError}
          onNew={() => void desktopAction("new")} onOpen={() => void desktopAction("open")} onSave={() => void desktopAction("save")} onImport={() => void desktopAction("import")} />}

        <section className="cf-hero" aria-label="Clipflow studio">
          <div className="cf-hero-copy">
            <div className="cf-step-num">Clipflow</div>
            <h1>Idea in.<br /><em>Video out.</em></h1>
            <p>Four numbered steps on one page — idea, script, visuals, export.</p>
          </div>
          <div className="cf-journey" aria-label="Workflow steps">
            <a href="#idea" className={idea.trim() ? "on" : undefined}><span>01</span> Idea</a>
            <a href="#script" className={generatedScript ? "on" : undefined}><span>02</span> Script</a>
            <a href="#visuals"><span>03</span> Visuals</a>
            <a href="#export" className={exportUrl ? "on" : undefined}><span>04</span> Export</a>
          </div>
        </section>

        <div className="cf-workspace">
          <div className="cf-editor-column">
            <section className="cf-idea-panel" id="idea">
              <div className="cf-panel-heading"><div className="cf-step-num">01</div><h2>What's the idea?</h2><p>One sentence is enough. We'll turn it into five editable beats.</p></div>
              <label className="cf-idea-label">YOUR VIDEO IDEA
                <textarea value={idea} disabled={isWorking} rows={3} onChange={(e) => { setIdea(e.target.value); setScriptOverrides({}); }} placeholder="What should this video say?" />
              </label>
              <label className="cf-pack-label">NICHE PACK
                <select aria-label="Niche pack" disabled={isWorking} value={packId} onChange={(e) => {
                  setPackId(e.target.value as PackId);
                  setScriptOverrides({});
                  setProjectBase(null);
                }}>
                  {PACK_IDS.map((id) => <option key={id} value={id}>{packLabel(id)}</option>)}
                </select>
              </label>
              {!idea.trim() && !isWorking && (
                <button type="button" className="cf-button cf-button-secondary cf-sample-idea" onClick={() => { setIdea(SAMPLE_IDEA); setScriptOverrides({}); }}>
                  TRY A SAMPLE IDEA IN ONE CLICK
                </button>
              )}
              <label className="cf-idea-label">THIS WEEK'S QUEUE
                <textarea value={queueText} disabled={isWorking} rows={2} onChange={(e) => setQueueText(e.target.value)} placeholder="One idea per line — line up the week's posts." />
              </label>
              {queueIdeas.length > 0 && (
                <div className="cf-queue-row">
                  <span>{queuePos.total > 0 ? `${queuePos.position}/${queuePos.total} IN QUEUE` : ""}</span>
                  <button type="button" className="cf-button cf-button-secondary" disabled={isWorking || queueNext < 0} onClick={() => {
                    const next = queueIdeas[queueNext];
                    if (next === undefined) return;
                    setIdea(next);
                    setScriptOverrides({});
                    setSelectedScene(0);
                  }}>
                    {queueNext < 0 ? "QUEUE DONE" : "LOAD NEXT IDEA"}
                  </button>
                </div>
              )}
              <ProfileSettings profile={profile} disabled={isWorking} saved={saved} onSave={onSaveProfile} onChange={(field, value) => {
                ({ niche: setNiche, audience: setAudience, offer: setOffer, tone: setTone, proof: setProof })[field](value);
                setScriptOverrides({});
              }} />
              {err && <p role="alert" className="cf-error">{err}</p>}
            </section>
            {generatedScript && <section className="cf-script-panel" id="script">
              <div className="cf-panel-heading"><div className="cf-step-num">02</div><h2>Make every beat count.</h2><p>Edit a line, then select it to inspect its frame. This script drives the narration, captions, and post copy.</p></div>
              <ScriptBeats generated={generatedScript} overrides={scriptOverrides} selected={selectedScene} disabled={isWorking} onSelect={setSelectedScene}
                captionLabels={editingSceneLabels ? captionLabels : undefined} onCaptionEdit={(index,value) => setCaptionOverrides((current) => ({ ...current, [index]: value }))}
                onEdit={(index, value) => setScriptOverrides((current) => ({ ...current, [index]: value }))}
                onReset={(index) => setScriptOverrides((current) => { const next = { ...current }; delete next[index]; return next; })} />
            </section>}
          </div>

          <section className="cf-preview-panel" aria-label="Video frame preview">
            <div className="cf-preview-heading"><div><span className="cf-kicker">LIVE FRAME</span><h2>{sceneLabels[selectedScene]}</h2></div><span className="cf-preview-ratio">9:16 / 720P</span></div>
            <div className="cf-canvas-wrap"><PreviewRenderer script={script} words={words} captions={captions} timing={timing} selectedScene={selectedScene} sceneChoices={sceneChoices} sceneAssets={sceneAssets} visualEffect={visualEffect} theme={theme} captionAnchor={preset.captionAnchor} onError={setErr} /></div>
            <div className="cf-scene-strip" aria-label="Select a scene">
              {sceneLabels.map((label, index) => <button key={label} type="button" disabled={isWorking} title={`${label}: ${sceneThumb(index) ? "visual selected" : sceneChoices[index]?.kind ?? "AI visual"}`} className={selectedScene === index ? "active" : ""} aria-pressed={selectedScene === index} onClick={() => setSelectedScene(index)}><span className="cf-scene-thumb" style={sceneThumb(index) ? { backgroundImage: `url('${sceneThumb(index)}')` } : undefined}>{String(index + 1).padStart(2, "0")}</span><b>{label}</b></button>)}
            </div>
            <p className="cf-preview-note">The selected frame uses the same scene image and drawing engine as the MP4.</p>
          </section>

          {generatedScript && aiSuggestions[selectedScene] && <div id="visuals">
            <SceneTray selected={selectedScene} choice={sceneChoices[selectedScene]!} suggestion={aiSuggestions[selectedScene]!} asset={sceneAssets[selectedScene] ?? null} loading={assetLoading} thumb={sceneThumb(selectedScene)} keyframeStatus={keyframeStatus} onGenerate={generateKeyframeNow} disabled={isWorking}
              pollinationsKey={pollinationsKey} onPollinationsKeyChange={onPollinationsKeyChange}
              onChoice={(choice) => setSceneChoices((choices) => choices.map((current, index) => index === selectedScene ? choice : current))}
              onUpload={(file) => void onUpload(file)} />
          </div>}
        </div>

        {script && <ExportPanel script={script} tiktok={tiktok} xpost={xpost} voiceOn={voiceOn} onVoiceChange={setVoiceOn} onPreviewVoice={() => previewSpeak(script.hook)}
          onExport={() => void runExport(exportCtx)} onCopy={(value) => void copyText(value)} status={status} progress={exportProgress} message={exportMsg} voiceWarn={voiceWarn} downloadUrl={exportUrl} voiceDownloadUrl={voiceDownloadUrl} captionMode={captionMode} onCaptionModeChange={setCaptionMode} visualEffect={visualEffect} onVisualEffectChange={setVisualEffect} platform={platform} onPlatformChange={setPlatform} creditOn={creditOn} onCreditChange={setCreditOn}
          nativeOutput={nativeOutput} nativePreview={nativeOutput ? nativeMediaUrl(nativeOutput) : null} onReveal={() => nativeOutput && void showInFolder(nativeOutput).catch(error => setErr(String(error)))} onCancel={desktop ? cancelExport : undefined} />}

        <footer className="cf-footer"><span>CLIPFLOW / BUILT TO KEEP IDEAS MOVING</span><a href="mailto:hello@mstudioweb.pt?subject=Clipflow%20Managed">NEED A MANAGED VIDEO PIPELINE? ↗</a></footer>
      </div>
    </main>
  );
}
