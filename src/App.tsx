import { useEffect, useMemo, useRef, useState } from "react";
import { makeCaptionPlan, resolveCaptionMode, suggestSceneLabel, type CaptionMode } from "../shared/caption-plan";
import { loadPack, PACK_IDS, packLabel, type Theme } from "./lib/packs";
import { saveProfile, loadInitialProfile } from "./lib/profile";
import { buildScript } from "./lib/script";
import { planFrames, planWordsTimed, VIDEO_SECS } from "./lib/planner";
import { browserStorage as storage, safeStorageGet } from "./lib/storage";
import { readSession, readWordTiming, writeSession, writeWordTiming, WORDTIMES_KEY, type SessionSnapshot } from "./lib/session";
import { drawFrame, type DrawCtx, type RenderExtra } from "./lib/render";
import { assignAiBackgrounds } from "./lib/ai-backgrounds";
import type { SceneChoice } from "./lib/scene-assets";
import { applyScriptOverrides, hasScriptOverrides, type ScriptOverrides } from "./lib/script-draft";
import { previewSpeak } from "./lib/tts";
import ProfileSettings from "./components/ProfileSettings";
import { useExportController, type ExportContext } from "./hooks/useExportController";
import { useSceneAssets } from "./hooks/useSceneAssets";
import ScriptBeats from "./components/ScriptBeats";
import SceneTray from "./components/SceneTray";
import ExportPanel from "./components/ExportPanel";
import { getCurrentWindow } from "@tauri-apps/api/window";
import DesktopToolbar from "./components/DesktopToolbar";
import { desktop, importNativeMedia, openDesktopProject, initialDesktopProject, saveDesktopProject, nativeMediaUrl, showInFolder, confirmDiscard, projectFingerprint, type DesktopProjectV1 } from "./lib/desktop";
import { gcUploads } from "./lib/upload-store";
import { markMilestone, SAMPLE_IDEA } from "./lib/activation";
import { isPlatformId, platformPreset, type PlatformId } from "../shared/platform-presets";
import { nextQueueIndex, parseQueueIdeas, queuePosition, WEEK_KEY } from "./lib/week-queue";
import type { VisualEffect } from "../shared/visual-effects";
import type { PackId } from "./lib/packs";
import { copyText, cueIndexOf } from "./lib/app-utils";

// Browser persistence is centralised in src/lib/session.ts (session snapshot +
// word timing) and src/lib/storage.ts (the single injected localStorage access
// point, shared with every hook). The editor reads/writes through that store so
// a privacy setting or storage failure degrades gracefully instead of crashing
// render.

export function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectError, setProjectError] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [projectBase, setProjectBase] = useState<{idea: string; profile: string; script: ReturnType<typeof buildScript>} | null>(null);
  // A single read feeds every profile-backed field: loadInitialProfile falls
  // back to the default profile when the persisted one is absent or unreadable.
  const initialProfile = useMemo(() => loadInitialProfile(storage), []);
  const [niche, setNiche] = useState(initialProfile.niche);
  const [audience, setAudience] = useState(initialProfile.audience);
  const [packId, setPackId] = useState<PackId>("mstudio");
  const [offer, setOffer] = useState(initialProfile.offer);
  const [tone, setTone] = useState(initialProfile.tone);
  const [proof, setProof] = useState(initialProfile.proof);
  const [saved, setSaved] = useState("");
  const [idea, setIdea] = useState("fixed-price websites that ship in two weeks");
  const [err, setErr] = useState("");
  // Export lifecycle: status, progress, messages, download/native output,
  // cancellation and the whole export run live behind the controller.
  const { status, exportMsg, exportProgress, exportUrl, voiceWarn, nativeOutput, busyRef, exportAbortRef, reset: resetExport, cancel: cancelExport, runExport } = useExportController(setErr);
  const [scriptOverrides, setScriptOverrides] = useState<ScriptOverrides>({});
  const [sceneChoices, setSceneChoices] = useState<SceneChoice[]>(() => Array.from({ length: 5 }, () => ({ kind: "auto-ai" })));
  const [selectedScene, setSelectedScene] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [captionMode, setCaptionMode] = useState<CaptionMode>("auto");
  const [platform, setPlatform] = useState<PlatformId>("tiktok");
  const [creditOn, setCreditOn] = useState(false);
  const [queueText, setQueueText] = useState(() => {
    try {
      return storage.getItem(WEEK_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [visualEffect, setVisualEffect] = useState<VisualEffect>("none");
  const [captionOverrides, setCaptionOverrides] = useState<Record<number, string>>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const profile = useMemo(() => ({ niche, audience, offer, tone, proof }), [niche, audience, offer, tone, proof]);
  const pack = useMemo(() => loadPack(packId), [packId]);
  const theme: Theme = pack.themes[1] ?? pack.themes[0]!;
  const preset = platformPreset(platform);
  const queueIdeas = useMemo(() => parseQueueIdeas(queueText), [queueText]);
  const queueNext = nextQueueIndex(queueIdeas, idea);
  const queuePos = queuePosition(queueIdeas, idea);
  const projectDraft = { version: 1 as const, idea, profile, scriptOverrides, sceneChoices, captionMode, captionOverrides, voiceOn, visualEffect, platform, credit: creditOn, pack: packId, timing: safeStorageGet(storage, WORDTIMES_KEY) };
  const projectSnapshot = projectFingerprint(projectDraft);
  const projectDirty = projectSnapshot !== savedSnapshot;

  function restoreProject(project: DesktopProjectV1, path: string | null) {
    if (project.version !== 1 || !Array.isArray(project.sceneChoices) || project.sceneChoices.length !== 5 || typeof project.idea !== "string" || !project.profile || !project.scriptOverrides || !project.captionOverrides) throw new Error("Invalid Clipflow project.");
    setIdea(project.idea); setNiche(project.profile.niche); setAudience(project.profile.audience); setOffer(project.profile.offer); setTone(project.profile.tone); setProof(project.profile.proof);
    if (project.baseScript && (!Array.isArray(project.baseScript.cues) || project.baseScript.cues.length !== 5)) throw new Error("The saved script has an invalid scene plan.");
    setProjectBase(project.baseScript ? {idea: project.idea, profile: projectFingerprint(project.profile), script: project.baseScript} : null);
    setScriptOverrides(project.scriptOverrides); setSceneChoices(project.sceneChoices); setCaptionMode(project.captionMode); setCaptionOverrides(project.captionOverrides); setVoiceOn(project.voiceOn); setVisualEffect(project.visualEffect ?? "none");
    if (isPlatformId(project.platform)) setPlatform(project.platform);
    setCreditOn(project.credit === true);
    if (typeof project.pack === "string" && (PACK_IDS as readonly string[]).includes(project.pack)) {
      setPackId(project.pack as PackId);
      setProjectBase(null);
    }
    writeWordTiming(storage, project.timing ?? null);
    const { savedAt: _savedAt, ...draft } = project;
    setSavedSnapshot(projectFingerprint(draft)); setProjectPath(path); setSelectedScene(0); resetExport(); setErr("");
  }

  async function desktopAction(action: "open" | "save" | "import" | "new") {
    if (projectBusy || status === "working") return;
    if ((action === "open" || action === "new") && projectDirty && !await confirmDiscard("Discard unsaved project changes? Save your project first to keep them.")) return;
    setProjectBusy(true); setProjectError("");
    try {
      if (action === "save") {
        const savedFrames = script ? planFrames(script, 30, timing?.windows ?? null, sceneChoices.map((choice,index) => choice.kind === "upload" && choice.approvedProof === true && sceneAssets[index]?.src === `upload:${choice.id}`), sceneAssets) : [];
        const renderPlan = script ? { renderer: "canvas-v1", fps: 30, duration: timing?.total ?? VIDEO_SECS, theme, captions,
          timingSource: timing ? "measured" : "estimated", scenes: script.cues.map((cue,index) => {
            const frame = savedFrames.find(frame => cueIndexOf(script, frame.cue) === index);
            return { ...cue, ...timing?.windows?.[index], motionIntent: frame?.motionIntent, motionLabels: frame?.motionLabels };
          }) } : null;
        const result = await saveDesktopProject({ ...projectDraft, baseScript: generatedScript, renderPlan, savedAt: new Date().toISOString() });
        if (result) { setSceneChoices(result.project.sceneChoices); setProjectPath(result.path); const { savedAt: _savedAt, ...draft } = result.project; setSavedSnapshot(projectFingerprint(draft)); }
      } else if (action === "open") {
        const result = await openDesktopProject(); if (result) restoreProject(result.project, result.path);
      } else if (action === "new") {
        restoreProject({ version: 1, idea: "", profile, scriptOverrides: {}, sceneChoices: Array.from({length: 5}, () => ({kind: "auto-ai"})), captionMode: "auto", captionOverrides: {}, voiceOn: false, visualEffect: "none", timing: null, savedAt: "" }, null);
      } else {
        const media = await importNativeMedia();
        if (media) setSceneChoices(current => current.map((choice,index) => index === selectedScene ? media : choice));
      }
    } catch (error) { setProjectError(error instanceof Error ? error.message : String(error)); }
    finally { setProjectBusy(false); }
  }

  useEffect(() => {
    if (!desktop) return;
    const nativeWindow = getCurrentWindow();
    const listener = nativeWindow.onCloseRequested(async event => {
      if (!projectDirty && !busyRef.current) return;
      event.preventDefault();
      const message = busyRef.current ? "Close Clipflow and cancel the current export? Unsaved changes will be lost." : "Close Clipflow without saving project changes?";
      if (await confirmDiscard(message)) { exportAbortRef.current?.abort(); await nativeWindow.destroy(); }
    });
    return () => { void listener.then(unlisten => unlisten()); };
  }, [projectDirty]);
  useEffect(() => {
    if (!desktop) return;
    void initialDesktopProject().then(result => { if (result) restoreProject(result.project, result.path); }).catch(error => setProjectError(String(error)));
  }, []);

  // Browser-only: collect stale uploads, then restore the last session so a
  // reload returns to the exact editor state (persisted uploads rehydrate
  // through loadSceneAsset on the resolved-choices effect below).
  useEffect(() => {
    if (desktop) return;
    void gcUploads().catch(() => {});
    try {
      markMilestone(storage, "firstVisit");
    } catch {
      // Instrumentation never breaks the editor.
    }
    const session = readSession(storage);
    if (!session) return;
    setIdea(session.idea);
    setScriptOverrides(session.scriptOverrides);
    setSceneChoices(session.sceneChoices);
    setCaptionMode(session.captionMode);
    setCaptionOverrides(session.captionOverrides);
    setVoiceOn(session.voiceOn);
    setVisualEffect(session.visualEffect);
    setPlatform(session.platform);
    setCreditOn(session.credit);
    setPackId(session.pack);
    setProjectBase(null);
  }, []);

  useEffect(() => {
    if (desktop) return;
    writeSession(storage, { idea, scriptOverrides, sceneChoices, captionMode, captionOverrides, voiceOn, visualEffect, platform, credit: creditOn, pack: packId } satisfies SessionSnapshot);
  }, [idea, scriptOverrides, sceneChoices, captionMode, captionOverrides, voiceOn, visualEffect, platform, creditOn, packId]);

  useEffect(() => {
    try {
      storage.setItem(WEEK_KEY, queueText);
    } catch {
      // Queue persistence is convenience; the editor works without it.
    }
  }, [queueText]);

  useEffect(() => {
    if (!desktop) return;
    const key = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey) return;
      const action = ({s: "save", o: "open", n: "new"} as const)[event.key.toLowerCase() as "s" | "o" | "n"];
      if (action) { event.preventDefault(); void desktopAction(action); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
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
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!script) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    try {
      const frames = planFrames(script, 30, timing?.windows ?? null, sceneChoices.map((choice, index) => choice.kind === "upload" && choice.approvedProof === true && sceneAssets[index]?.src === `upload:${choice.id}`), sceneAssets);
      const cueFrames = frames.filter((frame) => cueIndexOf(script, frame.cue) === selectedScene);
      const frame = cueFrames[Math.floor(cueFrames.length / 2)] ?? frames[0];
      if (!frame) return;
      const extra: RenderExtra = {};
      extra.visualEffect = visualEffect;
      extra.captions = captions;
      extra.captionAnchor = preset.captionAnchor;
      if (words) extra.words = words;
      const asset = sceneAssets[selectedScene];
      if (asset) extra.asset = asset;
      drawFrame(ctx as DrawCtx, frame, theme, 360, 640, extra, timing?.total ?? VIDEO_SECS);
      try {
        markMilestone(storage, "firstPreview");
      } catch {
        // Instrumentation never breaks the editor.
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [script, words, captions, timing, selectedScene, sceneAssets, sceneChoices, visualEffect, preset]);

  function onSave() {
    try {
      saveProfile(storage, { niche, audience, offer, tone, proof });
      setSaved("Saved.");
    } catch {
      setSaved("Storage quota exceeded — profile not saved.");
    }
  }

  // Export inputs, resolved at click time so the controller never sees a
  // stale closure over script/captions/choices.
  const exportCtx: ExportContext = { script, theme, captionAnchor: preset.captionAnchor, visualEffect, captions, words, captionLabels, captionMode, voiceOn, creditOn, timing, sceneChoices, aiSuggestions, loadSceneAsset };

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
              <ProfileSettings profile={profile} disabled={isWorking} saved={saved} onSave={onSave} onChange={(field, value) => {
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
            <div className="cf-canvas-wrap"><canvas ref={canvasRef} width={360} height={640} aria-label={`Scene ${selectedScene + 1} preview`} /></div>
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
          onExport={() => void runExport(exportCtx)} onCopy={(value) => void copyText(value)} status={status} progress={exportProgress} message={exportMsg} voiceWarn={voiceWarn} downloadUrl={exportUrl} captionMode={captionMode} onCaptionModeChange={setCaptionMode} visualEffect={visualEffect} onVisualEffectChange={setVisualEffect} platform={platform} onPlatformChange={setPlatform} creditOn={creditOn} onCreditChange={setCreditOn}
          nativeOutput={nativeOutput} nativePreview={nativeOutput ? nativeMediaUrl(nativeOutput) : null} onReveal={() => nativeOutput && void showInFolder(nativeOutput).catch(error => setErr(String(error)))} onCancel={desktop ? cancelExport : undefined} />}

        <footer className="cf-footer"><span>CLIPFLOW / BUILT TO KEEP IDEAS MOVING</span><a href="mailto:hello@mstudioweb.pt?subject=Clipflow%20Managed">NEED A MANAGED VIDEO PIPELINE? ↗</a></footer>
      </div>
    </main>
  );
}
