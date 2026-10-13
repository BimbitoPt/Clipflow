import { useEffect, useMemo, useRef, useState } from "react";
import { makeCaptionPlan, resolveCaptionMode, suggestSceneLabel, type CaptionMode } from "../shared/caption-plan";
import { loadPack, PACK_IDS, packLabel, type Theme } from "./lib/packs";
import { saveProfile, loadInitialProfile, type Profile } from "./lib/profile";
import { buildScript } from "./lib/script";
import { planFrames, planWordsTimed, voiceGridFromCues, VIDEO_SECS, type PlannedFrame, type TimedCueTiming } from "./lib/planner";
import { browserStore, safeStorageGet } from "./lib/storage";
import { readSession, readWordTiming, writeSession, writeWordTiming, WORDTIMES_KEY, type SessionSnapshot } from "./lib/session";
import { drawFrame, CREDIT_SECS, type DrawCtx, type RenderExtra } from "./lib/render";
import { preloadAsset, STOCK_POOL, type StockAsset } from "./lib/broll";
import { AI_BACKGROUNDS, assignAiBackgrounds } from "./lib/ai-backgrounds";
import { resolveSceneChoices, type ResolvedSceneChoice, type SceneChoice } from "./lib/scene-assets";
import { applyScriptOverrides, hasScriptOverrides, type ScriptOverrides } from "./lib/script-draft";
import { previewSpeak } from "./lib/tts";
import { createKokoroLoader, KOKORO_SAMPLE_RATE, resampleLinear } from "./lib/tts-local";
import { createKokoroTimedLoader } from "./lib/tts-timed";
import ProfileSettings from "./components/ProfileSettings";
import ScriptBeats from "./components/ScriptBeats";
import SceneTray from "./components/SceneTray";
import ExportPanel from "./components/ExportPanel";
import { getCurrentWindow } from "@tauri-apps/api/window";
import DesktopToolbar from "./components/DesktopToolbar";
import { desktop, importNativeMedia, openDesktopProject, initialDesktopProject, saveDesktopProject, nativeMediaUrl, showInFolder, confirmDiscard, projectFingerprint, type DesktopProjectV1 } from "./lib/desktop";
import { renderDesktop } from "./lib/desktop-render";
import { deleteUpload, gcUploads, loadUploadBlob, saveUpload, touchUpload } from "./lib/upload-store";
import { buildKeyframePrompt, generateKeyframe, hashSeed, keyframeId, keyframeSeedOf, keyframeUrl, loadPollinationsKey, sanitizePollinationsKey, savePollinationsKey, type KeyframeStatus } from "./lib/keyframes";
import { markMilestone, recordExport, SAMPLE_IDEA } from "./lib/activation";
import { probeAudioConfig, probeVideoConfig } from "./lib/export-worker-protocol";
import { isPlatformId, platformPreset, type PlatformId } from "../shared/platform-presets";
import { nextQueueIndex, parseQueueIdeas, queuePosition, WEEK_KEY } from "./lib/week-queue";
import type { VisualEffect } from "../shared/visual-effects";
import type { PackId } from "./lib/packs";

import { copyText, cueIndexOf, seekVideo } from "./lib/app-utils";
import { OUT_NAME, runBrowserExport } from "./lib/browser-export";

// Browser persistence is centralised in src/lib/session.ts (session snapshot +
// word timing) and src/lib/storage.ts (the localStorage access point). The
// editor reads/writes through that single injected store so a privacy setting
// or storage failure degrades gracefully instead of crashing render.
const storage = browserStore();

export function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectError, setProjectError] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [projectBase, setProjectBase] = useState<{idea: string; profile: string; script: ReturnType<typeof buildScript>} | null>(null);
  const [nativeOutput, setNativeOutput] = useState<string | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
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
  const [status, setStatus] = useState<"idle" | "working" | "exported" | "error">("idle");
  const [scriptOverrides, setScriptOverrides] = useState<ScriptOverrides>({});
  const [sceneChoices, setSceneChoices] = useState<SceneChoice[]>(() => Array.from({ length: 5 }, () => ({ kind: "auto-ai" })));
  const [selectedScene, setSelectedScene] = useState(0);
  const [sceneAssets, setSceneAssets] = useState<Array<StockAsset | null>>([]);
  const [assetLoading, setAssetLoading] = useState(false);
  // Script-driven keyframes: one status per scene, plus caches. Generated
  // media lives in its own maps (not uploadsRef) so the upload GC pass never
  // evicts an image a scene choice still points at.
  const [keyframeStatus, setKeyframeStatus] = useState<KeyframeStatus[]>(() => Array.from({ length: 5 }, () => "idle" as KeyframeStatus));
  const [keyframeBump, setKeyframeBump] = useState(0);
  const generatedRef = useRef<Map<string, StockAsset>>(new Map());
  const generatedBlobRef = useRef<Map<string, Blob>>(new Map());
  const generatedUrlRef = useRef<Map<string, string>>(new Map());
  const keyframeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const keyframeRunRef = useRef(0);
  const [pollinationsKey, setPollinationsKey] = useState(() => {
    try {
      return loadPollinationsKey(storage) || sanitizePollinationsKey((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_POLLINATIONS_KEY ?? "");
    } catch {
      return "";
    }
  });
  const pollinationsKeyRef = useRef(pollinationsKey);
  pollinationsKeyRef.current = pollinationsKey;
  // Optional app attribution for Pollinations earnings: anonymous + app-key
  // generations carry this referrer so usage credits flow back to the app.
  const pollinationsReferrer = useMemo(() => {
    try {
      return ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_POLLINATIONS_REFERRER ?? "").trim();
    } catch {
      return "";
    }
  }, []);
  function handlePollinationsKeyChange(value: string): void {
    setPollinationsKey(value.trim());
    savePollinationsKey(storage, value);
  }
  const sceneChoicesRef = useRef(sceneChoices);
  sceneChoicesRef.current = sceneChoices;
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
  const [exportMsg, setExportMsg] = useState("");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  useEffect(() => () => { if (exportUrl) URL.revokeObjectURL(exportUrl); }, [exportUrl]);
  const [voiceWarn, setVoiceWarn] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  const uploadsRef = useRef<Map<string, StockAsset>>(new Map());
  const uploadThumbsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    return () => {
      try {
        for (const asset of uploadsRef.current.values()) if (asset.kind === "image") (asset.el as ImageBitmap).close();
        uploadsRef.current.clear();
        uploadThumbsRef.current.clear();
        for (const asset of generatedRef.current.values()) if (asset.kind === "image") (asset.el as ImageBitmap).close();
        generatedRef.current.clear();
        generatedBlobRef.current.clear();
        for (const url of generatedUrlRef.current.values()) URL.revokeObjectURL(url);
        generatedUrlRef.current.clear();
      } catch {
        // close on unmount is best-effort; never throw.
      }
    };
  }, []);

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
    setSavedSnapshot(projectFingerprint(draft)); setProjectPath(path); setSelectedScene(0); setNativeOutput(null); setExportUrl(null); setStatus("idle"); setErr("");
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
  const resolvedChoices = useMemo(() => resolveSceneChoices(sceneChoices, aiSuggestions, STOCK_POOL), [sceneChoices, aiSuggestions, keyframeBump]);

  // --- Script-driven keyframes ---------------------------------------------
  // A new script queues one keyframe per beat against the free image endpoint
  // (no key, no cost); the shared generator spaces requests and retries the
  // anonymous 402 throttle. Bytes are cached in OPFS like uploads, so reloads
  // and reopened projects never re-hit the network. Anything the user picked
  // manually (stock / upload / library) is never overwritten; failures stay
  // on the offline AI pool.
  const keyframeFp = useMemo(() => generatedScript ? String(hashSeed(`${idea}|${generatedScript.cues.map((cue) => cue.text).join("\u0001")}`)) : null, [idea, generatedScript]);

  function keyframeTarget(index: number): { prompt: string; seed: number; id: string } {
    const prompt = buildKeyframePrompt(generatedScript?.cues[index]?.text ?? "", profile);
    const seed = hashSeed(`${idea}|${keyframeFp}|${index}|${prompt}`);
    return { prompt, seed, id: keyframeId(seed) };
  }

  async function ensureKeyframe(index: number, target: { prompt: string; seed: number; id: string }, apply: "auto" | "force" | "skip"): Promise<void> {
    const run = keyframeRunRef.current;
    setKeyframeStatus((statuses) => statuses.map((status, i) => i === index ? "generating" : status));
    try {
      let blob = generatedBlobRef.current.get(target.id) ?? await loadUploadBlob(target.id);
      if (!blob) {
        blob = await generateKeyframe(keyframeUrl(target.prompt, target.seed, { key: pollinationsKeyRef.current, referrer: pollinationsReferrer }));
        generatedBlobRef.current.set(target.id, blob);
        try { await saveUpload(target.id, blob); } catch { /* session-only keyframe */ }
      }
      touchUpload(target.id);
      if (run !== keyframeRunRef.current) return; // script changed mid-fetch
      setKeyframeStatus((statuses) => statuses.map((status, i) => i === index ? "ready" : status));
      if (apply !== "skip") {
        setSceneChoices((choices) => choices.map((choice, i) => {
          if (i !== index) return choice;
          if (apply === "auto" && choice.kind !== "auto-ai" && choice.kind !== "generated") return choice;
          return { kind: "generated", id: target.id, fp: keyframeFp ?? undefined };
        }));
      }
      setKeyframeBump((n) => n + 1);
    } catch {
      // Offline or throttled: stay on the offline pool, surface status only.
      if (run === keyframeRunRef.current) setKeyframeStatus((statuses) => statuses.map((status, i) => i === index ? "error" : status));
    }
  }

  const keyframeRunOnceRef = useRef<string | null>(null);
  useEffect(() => {
    if (keyframeFp === null) return;
    if (keyframeRunOnceRef.current === keyframeFp) return;
    keyframeRunOnceRef.current = keyframeFp;
    const run = ++keyframeRunRef.current;
    setKeyframeStatus(Array.from({ length: 5 }, () => "idle" as KeyframeStatus));
    for (let index = 0; index < 5; index++) {
      keyframeQueueRef.current = keyframeQueueRef.current.then(async () => {
        if (run !== keyframeRunRef.current) return;
        const choice = sceneChoicesRef.current[index];
        if (!choice) return;
        if (choice.kind === "auto-ai") {
          await ensureKeyframe(index, keyframeTarget(index), "auto");
          return;
        }
        if (choice.kind === "generated" && choice.fp !== keyframeFp) {
          // Script changed since this keyframe was made → replace it.
          await ensureKeyframe(index, keyframeTarget(index), "auto");
          return;
        }
        if (choice.kind === "generated") {
          // Same script (reload / reopened project): heal the cache only.
          const cached = generatedBlobRef.current.has(choice.id) || !!(await loadUploadBlob(choice.id));
          if (cached) {
            setKeyframeStatus((statuses) => statuses.map((status, i) => i === index ? "ready" : status));
            return;
          }
          const seed = keyframeSeedOf(choice.id);
          const prompt = buildKeyframePrompt(generatedScript?.cues[index]?.text ?? "", profile);
          await ensureKeyframe(index, { prompt, seed: seed ?? hashSeed(`${idea}|${keyframeFp}|${index}|${prompt}`), id: choice.id }, "skip");
          return;
        }
        // User picked stock/upload/library for this scene — leave it alone.
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyframeFp]);

  /** Manual generate (idle/error) or regenerate (ready) for one scene. */
  function generateKeyframeNow(index: number, force: boolean): void {
    if (!generatedScript) return;
    keyframeQueueRef.current = keyframeQueueRef.current.then(async () => {
      const base = keyframeTarget(index);
      if (force) {
        const seed = hashSeed(`${base.seed}|regen|${Date.now()}`);
        await ensureKeyframe(index, { ...base, seed, id: keyframeId(seed) }, "force");
      } else {
        const choice = sceneChoicesRef.current[index];
        // Already applied AND healthy → nothing to do. Stale/error states fall
        // through so RETRY actually refetches.
        if (choice?.kind === "generated" && choice.fp === keyframeFp && keyframeStatus[index] === "ready") return;
        await ensureKeyframe(index, base, "force");
      }
    });
  }


  async function loadSceneAsset(choice: ResolvedSceneChoice): Promise<StockAsset | null> {
    if (choice.kind === "upload" || choice.kind === "generated") {
      const generated = choice.kind === "generated";
      const cache = generated ? generatedRef.current : uploadsRef.current;
      const cached = cache.get(choice.id);
      if (cached) return cached;
      // Rehydrate: uploads and generated keyframes persist in OPFS, so a
      // reload or a reopened project recovers its media instead of silently
      // losing footage.
      try {
        const blob = (generated ? generatedBlobRef.current.get(choice.id) : null) ?? await loadUploadBlob(choice.id);
        if (!blob) return null;
        const bmp = await createImageBitmap(blob);
        const asset: StockAsset = { kind: "image", src: `${generated ? "generated" : "upload"}:${choice.id}`, el: bmp, keywords: [] };
        cache.set(choice.id, asset);
        if (generated) {
          if (!generatedUrlRef.current.has(choice.id)) generatedUrlRef.current.set(choice.id, URL.createObjectURL(blob));
        }
        touchUpload(choice.id);
        return asset;
      } catch {
        return null;
      }
    }
    if (choice.kind === "fallback") return null;
    try { return await preloadAsset(choice.entry); } catch { return null; }
  }

  useEffect(() => {
    let cancelled = false;
    setAssetLoading(true);
    void Promise.all(resolvedChoices.map(loadSceneAsset)).then((assets) => {
      if (!cancelled) { setSceneAssets(assets); setAssetLoading(false); }
    });
    return () => { cancelled = true; };
  }, [resolvedChoices]);

  useEffect(() => {
    const liveUploads = new Set(sceneChoices.flatMap((choice) => choice.kind === "upload" ? [choice.id] : []));
    for (const [id, asset] of uploadsRef.current) {
      if (liveUploads.has(id)) continue;
      const stillInPreview = sceneAssets.some((sceneAsset) => sceneAsset?.kind === "image" && sceneAsset.src === `upload:${id}`);
      if (stillInPreview) continue;
      if (asset.kind === "image") (asset.el as ImageBitmap).close();
      uploadsRef.current.delete(id);
      uploadThumbsRef.current.delete(id);
      void deleteUpload(id);
    }
  }, [sceneChoices, sceneAssets]);

  async function onUpload(file: File) {
    // Keep the upload target stable if the user changes scenes while decoding
    // or persisting the selected file.
    const targetScene = selectedScene;
    try {
      const bmp = await createImageBitmap(file);
      const id = crypto.randomUUID();
      uploadsRef.current.set(id, { kind: "image", src: `upload:${id}`, el: bmp, keywords: [] });
      // Write-through persist: the upload survives reloads. Best-effort —
      // the session keeps working from memory if storage is unavailable.
      touchUpload(id);
      try {
        if (!(await saveUpload(id, file))) console.warn("Clipflow: upload runs session-only, device storage unavailable.");
      } catch {
        console.warn("Clipflow: upload runs session-only, persist failed.");
      }
      setSceneChoices((choices) => choices.map((choice, index) => index === targetScene ? { kind: "upload", id, approvedProof: false } : choice));
      setErr("");
    } catch {
      setErr("Could not load that image — try another file.");
    }
  }

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

  async function onExport() {
    if (!script) return;
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // Capability probe first: fail fast with a named cause instead of
      // dying mid-export. The desktop app (FFmpeg) is the universal fallback.
      if (!desktop) {
        const videoProbe = await probeVideoConfig();
        if (!videoProbe.supported) {
          setStatus("error");
          setErr(videoProbe.reason === "missing"
            ? "This browser can't hardware-encode — open in Chrome/Edge, or use the desktop app."
            : "This browser refused the 720x1280 H.264 export config — update Chrome/Edge, or use the desktop app.");
          return;
        }
        if (voiceOn && typeof AudioData === "undefined") {
          setStatus("error");
          setErr("This browser can't encode audio — export silently or try Chrome/Edge.");
          return;
        }
        if (voiceOn) {
          const audioProbe = await probeAudioConfig();
          if (!audioProbe.supported) {
            setStatus("error");
            setErr(audioProbe.reason === "missing"
              ? "This browser can't encode audio — export silently or try Chrome/Edge."
              : "This browser refused the voice export config — export silently or update Chrome/Edge.");
            return;
          }
        }
      }
      setStatus("working");
      exportAbortRef.current = new AbortController();
      setNativeOutput(null);
      setExportUrl(null);
      setErr("");
      setExportMsg("Script ready.");
      setExportProgress(10);
      setVoiceWarn("");
      try {
        setExportMsg("Loading selected scene visuals…");
        setExportProgress(25);
        const exportChoices = [...sceneChoices];
        const cueAssets = await Promise.all(resolveSceneChoices(exportChoices, aiSuggestions, STOCK_POOL).map(loadSceneAsset));
        if (desktop && cueAssets.some(asset => !asset)) throw new Error("A selected scene's media could not be loaded. Reimport it before exporting.");
        const approvedProofByCue = exportChoices.map((choice, index) => choice.kind === "upload" && choice.approvedProof === true && cueAssets[index]?.src === `upload:${choice.id}`);
        setExportProgress(35);
        let pcm: Float32Array | null = null;
        // Real word timings when the timed model synthesized the voice; the
        // sidecar/even-split memo stays the fallback — timed synthesis can
        // only ever upgrade captions, never break the export.
        let synthesizedCues: Array<TimedCueTiming | null> | null = null;
        if (voiceOn) {
          const cueTexts = script.cues.map((cue) => cue.text);
          setExportMsg("Rendering voice…");
          setExportProgress(50);
          try {
            let raw: Float32Array;
            try {
              const timed = await createKokoroTimedLoader()(cueTexts);
              raw = timed.audio;
              synthesizedCues = timed.cues;
            } catch {
              // Timestamped model unavailable or alignment failed → plain
              // synthesis; captions keep the memoized (sidecar/even-split) timing.
              raw = await createKokoroLoader()(cueTexts.join(". "));
            }
            const ceiling = Math.round(VIDEO_SECS * KOKORO_SAMPLE_RATE);
            // Voice-fitted grid: when timed synthesis produced a span per
            // cue, the audio defines the length (trimmed only past the 45s
            // ceiling) instead of being padded to the fixed grid.
            const target = synthesizedCues && voiceGridFromCues(synthesizedCues) ? Math.min(raw.length, ceiling) : Math.round((timing?.total ?? VIDEO_SECS) * KOKORO_SAMPLE_RATE);
            if (raw.length > target) {
              const secs = (raw.length / KOKORO_SAMPLE_RATE).toFixed(1);
              setVoiceWarn(`Voice ran ${secs}s — trimmed to ${VIDEO_SECS}s video. Shorten the idea for a perfect fit.`);
              pcm = raw.slice(0, target);
            } else if (target === raw.length) {
              pcm = raw;
            } else {
              const fitted = new Float32Array(target);
              fitted.set(raw, 0);
              pcm = fitted;
            }
            // Normalize: local TTS runs quiet-to-moderate (Kokoro peaks ~0.5)
            // — peak to 0.89 so every export is loud and consistent.
            if (pcm) {
              let peak = 0;
              for (let i = 0; i < pcm.length; i++) {
                const a = Math.abs(pcm[i]);
                if (a > peak) peak = a;
              }
              if (peak > 0.001) {
                const gv = 0.89 / peak;
                for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-1, Math.min(1, pcm[i] * gv));
              }
            }
          } catch (e) {
            setStatus("error");
            setErr(e instanceof Error ? e.message : String(e));
            return;
          } finally {
            setExportProgress(65);
          }
        }
        // Captions for THIS export: real synthesized word times when the
        // timed model ran, otherwise the memoized plan (sidecar/even-split).
        const exportWords = synthesizedCues ? planWordsTimed(script, synthesizedCues) : words;
        // Visuals follow the same timeline: synthesized cue spans drive the
        // render grid and caption phrase windows (clamped at the 45s ceiling
        // when the voice was trimmed). The fixed grid / sidecar stays the
        // fallback whenever timed synthesis didn't run or has a gap.
        const voiceWindows = synthesizedCues && pcm ? voiceGridFromCues(synthesizedCues) : null;
        const voiceTotal = voiceWindows && pcm ? Math.min(pcm.length / KOKORO_SAMPLE_RATE, VIDEO_SECS) : null;
        const exportWindows = voiceTotal !== null
          ? voiceWindows!.map((span) => ({ start: Math.min(span.start, voiceTotal), end: Math.min(span.end, voiceTotal) }))
          : timing?.windows ?? null;
        const baseDuration = voiceTotal ?? timing?.total ?? VIDEO_SECS;
        const synthesized = synthesizedCues;
        const exportCaptions = synthesized
          ? makeCaptionPlan({
              mode: captionMode,
              voiceOn,
              labels: captionLabels,
              words: exportWords,
              scenes: script.cues.map((cue, index) => ({
                ...cue,
                ...(synthesized[index]?.span
                  ? { start: synthesized[index]!.span[0], end: synthesized[index]!.span[1] }
                  : timing?.windows?.[index] ?? { start: cue.start, end: cue.end }),
              })),
            })
          : captions;
        if (desktop) {
          exportAbortRef.current.signal.throwIfAborted();
          // The Rust WAV sink is pinned to 16 kHz (src-tauri/src/render.rs);
          // Kokoro speaks 24 kHz — downsample once here, FFmpeg muxes it.
          if (pcm) pcm = resampleLinear(pcm, KOKORO_SAMPLE_RATE, 16000);
          const totalDuration = baseDuration + (creditOn ? CREDIT_SECS : 0);
          const baseFrames = planFrames(script, 30, exportWindows, approvedProofByCue, cueAssets);
          const lastCue = script.cues[script.cues.length - 1]!;
          const cardFrames: PlannedFrame[] = creditOn
            ? Array.from({ length: Math.round(CREDIT_SECS * 30) }, (_, i) => ({ t: baseDuration + i / 30, cue: lastCue }))
            : [];
          const output = await renderDesktop({
            frames: [...baseFrames, ...cardFrames], assets: cueAssets, theme,
            extra: { captions: exportCaptions, words: exportWords, visualEffect, captionAnchor: preset.captionAnchor }, duration: totalDuration,
            endCardAfter: creditOn ? baseDuration : undefined, pcm, signal: exportAbortRef.current.signal,
            cueIndex: frame => cueIndexOf(script, frame.cue), seek: seekVideo,
            progress: (percent,message) => { setExportProgress(percent); setExportMsg(message); },
          });
          if (output) { setNativeOutput(output); setStatus("exported"); setExportMsg(""); try { recordExport(storage, Date.now()); } catch { /* instrumentation never breaks export */ } }
          else { setStatus("idle"); setExportMsg(""); }
          return;
        }
        const buffer = await runBrowserExport({
          script,
          theme,
          visualEffect,
          captionAnchor: preset.captionAnchor,
          captions: exportCaptions,
          words: exportWords,
          windows: exportWindows,
          baseDuration,
          creditOn,
          voiceOn,
          cueAssets,
          approvedProofByCue,
          pcm,
          signal: exportAbortRef.current.signal,
          onMessage: setExportMsg,
          onPercent: setExportProgress,
        });
        const blob = new Blob([buffer], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        setExportUrl(url);
        try {
          recordExport(storage, Date.now());
        } catch {
          // Activation stamp is instrumentation; the download already fired.
        }
        const a = document.createElement("a");
        a.href = url;
        a.download = OUT_NAME;
        a.click();
        setStatus("exported");
      } catch (e) {
        setStatus("error");
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setExportProgress(0);
      }
    } finally {
      busyRef.current = false;
      exportAbortRef.current = null;
    }
  }

  const tiktok = script ? `${script.hook} ${pack.hashtags.join(" ")}` : "";
  const xpost = script ? `${script.hook} ${script.cta}`.slice(0, 280) : "";

  const sceneLabels = ["HOOK", "BEAT 01", "BEAT 02", "BEAT 03", "CTA"];
  const isWorking = status === "working" || projectBusy;
  const sceneThumb = (index: number): string | undefined => {
    const choice = sceneChoices[index];
    if (choice?.kind === "auto-ai") return aiSuggestions[index]?.src;
    if (choice?.kind === "ai") return AI_BACKGROUNDS.find((item) => item.id === choice.id)?.src;
    if (choice?.kind === "generated") return generatedUrlRef.current.get(choice.id);
    if (choice?.kind === "stock") return STOCK_POOL.find((item) => item.src === choice.src)?.kind === "image" ? choice.src : undefined;
    if (choice?.kind === "upload") {
      const cached = uploadThumbsRef.current.get(choice.id);
      if (cached) return cached;
      const asset = uploadsRef.current.get(choice.id);
      if (!asset || asset.kind !== "image") return undefined;
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 64;
      canvas.getContext("2d")?.drawImage(asset.el as ImageBitmap, 0, 0, 48, 64);
      try {
        const preview = canvas.toDataURL("image/jpeg", 0.72);
        uploadThumbsRef.current.set(choice.id, preview);
        return preview;
      } catch { return undefined; }
    }
    return undefined;
  };

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
              pollinationsKey={pollinationsKey} onPollinationsKeyChange={handlePollinationsKeyChange}
              onChoice={(choice) => setSceneChoices((choices) => choices.map((current, index) => index === selectedScene ? choice : current))}
              onUpload={(file) => void onUpload(file)} />
          </div>}
        </div>

        {script && <ExportPanel script={script} tiktok={tiktok} xpost={xpost} voiceOn={voiceOn} onVoiceChange={setVoiceOn} onPreviewVoice={() => previewSpeak(script.hook)}
          onExport={() => void onExport()} onCopy={(value) => void copyText(value)} status={status} progress={exportProgress} message={exportMsg} voiceWarn={voiceWarn} downloadUrl={exportUrl} captionMode={captionMode} onCaptionModeChange={setCaptionMode} visualEffect={visualEffect} onVisualEffectChange={setVisualEffect} platform={platform} onPlatformChange={setPlatform} creditOn={creditOn} onCreditChange={setCreditOn}
          nativeOutput={nativeOutput} nativePreview={nativeOutput ? nativeMediaUrl(nativeOutput) : null} onReveal={() => nativeOutput && void showInFolder(nativeOutput).catch(error => setErr(String(error)))} onCancel={desktop ? () => exportAbortRef.current?.abort() : undefined} />}

        <footer className="cf-footer"><span>CLIPFLOW / BUILT TO KEEP IDEAS MOVING</span><a href="mailto:hello@mstudioweb.pt?subject=Clipflow%20Managed">NEED A MANAGED VIDEO PIPELINE? ↗</a></footer>
      </div>
    </main>
  );
}
