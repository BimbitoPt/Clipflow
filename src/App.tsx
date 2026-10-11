import { useEffect, useMemo, useRef, useState } from "react";
import { makeCaptionPlan, resolveCaptionMode, suggestSceneLabel, type CaptionMode } from "../shared/caption-plan";
import { loadPack, PACK_IDS, packLabel, type Theme } from "./lib/packs";
import { MSTUDIO_PROFILE, loadProfile, saveProfile, type Profile } from "./lib/profile";
import { buildScript } from "./lib/script";
import { planFrames, planWordsTimed, VIDEO_SECS, type PlannedFrame, type TimedCueTiming } from "./lib/planner";
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
import { markMilestone, recordExport, SAMPLE_IDEA } from "./lib/activation";
import { MAX_QUEUE, AUDIO_CONFIG, probeAudioConfig, probeVideoConfig, RESUME_QUEUE, type FromWorker } from "./lib/export-worker-protocol";
import { isPlatformId, platformPreset, type PlatformId } from "../shared/platform-presets";
import { nextQueueIndex, parseQueueIdeas, queuePosition, WEEK_KEY } from "./lib/week-queue";
import type { VisualEffect } from "../shared/visual-effects";
import type { PackId } from "./lib/packs";

const OUT_W = 720, OUT_H = 1280, OUT_NAME = "clipflow-916.mp4";

// Browser session snapshot: React state (idea, beats, scene choices) dies
// with the tab while uploads/timing/profile already persist — without this,
// a browser reload orphaned persisted uploads. Desktop skips it entirely:
// the native `.clipflow` project is the source of truth there.
const SESSION_KEY = "clipflow.session";

function validSceneChoice(choice: unknown): choice is SceneChoice {
  if (!choice || typeof choice !== "object") return false;
  const kind = (choice as { kind?: unknown }).kind;
  return kind === "auto-ai" || kind === "ai" || kind === "stock" || kind === "upload" || kind === "native";
}

function readSession(): {
  idea: string; scriptOverrides: ScriptOverrides; sceneChoices: SceneChoice[];
  captionMode: CaptionMode; captionOverrides: Record<number, string>;
  voiceOn: boolean; visualEffect: VisualEffect; platform: PlatformId; credit: boolean; pack: PackId;
} | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      version?: unknown; idea?: unknown; scriptOverrides?: unknown; sceneChoices?: unknown;
      captionMode?: unknown; captionOverrides?: unknown; voiceOn?: unknown; visualEffect?: unknown;
      platform?: unknown; credit?: unknown; pack?: unknown;
    };
    if (!parsed || parsed.version !== 1 || typeof parsed.idea !== "string") return null;
    if (!Array.isArray(parsed.sceneChoices) || parsed.sceneChoices.length !== 5 || !parsed.sceneChoices.every(validSceneChoice)) return null;
    if (parsed.scriptOverrides === null || typeof parsed.scriptOverrides !== "object" || Array.isArray(parsed.scriptOverrides)) return null;
    if (!["auto", "scene", "speech", "off"].includes(parsed.captionMode as string)) return null;
    if (parsed.captionOverrides === null || typeof parsed.captionOverrides !== "object") return null;
    if (typeof parsed.voiceOn !== "boolean") return null;
    if (!["none", "cinematic", "mono", "vivid", "analog"].includes(parsed.visualEffect as string)) return null;
    return {
      idea: parsed.idea,
      scriptOverrides: parsed.scriptOverrides as ScriptOverrides,
      sceneChoices: parsed.sceneChoices,
      captionMode: parsed.captionMode as CaptionMode,
      captionOverrides: parsed.captionOverrides as Record<number, string>,
      voiceOn: parsed.voiceOn,
      visualEffect: parsed.visualEffect as VisualEffect,
      platform: isPlatformId(parsed.platform) ? parsed.platform : "tiktok",
      credit: parsed.credit === true,
      pack: typeof parsed.pack === "string" && (PACK_IDS as readonly string[]).includes(parsed.pack) ? parsed.pack as PackId : "mstudio",
    };
  } catch {
    return null;
  }
}

function store() {
  return { getItem: (k: string) => localStorage.getItem(k), setItem: (k: string, v: string) => localStorage.setItem(k, v) };
}

function initialProfile() {
  try {
    return loadProfile({ getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) }) ?? MSTUDIO_PROFILE;
  } catch {
    return MSTUDIO_PROFILE;
  }
}

async function copyText(s: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(s);
    return;
  } catch {
    // fall through to legacy textarea path
  }
  const ta = document.createElement("textarea");
  ta.value = s;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

function cueIndexOf(script: { cues: Array<{ start: number; kind: string }> }, cue: { start: number; kind: string }): number {
  const byRef = (script.cues as unknown[]).indexOf(cue as unknown);
  if (byRef >= 0) return byRef;
  const byStart = script.cues.findIndex((c) => c.start === cue.start && c.kind === cue.kind);
  return byStart >= 0 ? byStart : 0;
}

// Voice-timed karaoke sidecar (localStorage `clipflow.wordtimes`), written
// by the headless VO pipeline next to the wav it was measured from. Applied
// only on exact idea+profile match — otherwise the deterministic even-split
// grid is used, so stale timings can never leak into another video.
// Optional voice-driven render grid (windows + total): when present and
// valid, the video renders the measured cue spans instead of the fixed 45s
// grid, so a tightly packed VO yields a shorter video.
function readWordTiming(
  idea: string,
  profile: Profile,
): {
  cues: TimedCueTiming[];
  windows: Array<{ start: number; end: number }> | null;
  total: number | null;
  assets: Array<string | null> | null;
} | null {
  try {
    const raw = localStorage.getItem("clipflow.wordtimes");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      idea?: unknown;
      profile?: Partial<Profile>;
      cues?: unknown;
      windows?: unknown;
      total?: unknown;
      assets?: unknown;
    };
    if (!parsed || parsed.idea !== idea) return null;
    const p = parsed.profile;
    if (
      !p ||
      p.niche !== profile.niche ||
      p.audience !== profile.audience ||
      p.offer !== profile.offer ||
      p.tone !== profile.tone ||
      p.proof !== profile.proof
    ) {
      return null;
    }
    if (!Array.isArray(parsed.cues)) return null;
    let windows: Array<{ start: number; end: number }> | null = null;
    if (
      Array.isArray(parsed.windows) &&
      parsed.windows.length === parsed.cues.length &&
      parsed.windows.every(
        (w) =>
          w &&
          typeof (w as { start: unknown }).start === "number" &&
          typeof (w as { end: unknown }).end === "number",
      )
    ) {
      windows = parsed.windows as Array<{ start: number; end: number }>;
    }
    const total =
      typeof parsed.total === "number" && Number.isFinite(parsed.total) && parsed.total > 0
        ? parsed.total
        : null;
    let assets: Array<string | null> | null = null;
    if (
      Array.isArray(parsed.assets) &&
      parsed.assets.every((a) => a === null || typeof a === "string")
    ) {
      assets = parsed.assets as Array<string | null>;
    }
    return { cues: parsed.cues as TimedCueTiming[], windows, total, assets };
  } catch {
    return null;
  }
}

async function seekVideo(el: HTMLVideoElement, t: number): Promise<void> {
  try {
    const dur = el.duration;
    const target = Number.isFinite(dur) && dur > 0 ? t % dur : t;
    if (Math.abs(el.currentTime - target) < 0.001) return;
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      const timer = setTimeout(finish, 250);
      const onSeeked = () => {
        clearTimeout(timer);
        el.removeEventListener("seeked", onSeeked);
        finish();
      };
      el.addEventListener("seeked", onSeeked, { once: true });
      try {
        el.currentTime = target;
      } catch {
        clearTimeout(timer);
        finish();
      }
    });
  } catch {
    // Seek is best-effort; gradient/video-current-frame fallback covers failure.
  }
}

export function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectError, setProjectError] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [projectBase, setProjectBase] = useState<{idea: string; profile: string; script: ReturnType<typeof buildScript>} | null>(null);
  const [nativeOutput, setNativeOutput] = useState<string | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const [niche, setNiche] = useState(() => initialProfile().niche);
  const [audience, setAudience] = useState(() => initialProfile().audience);
  const [packId, setPackId] = useState<PackId>("mstudio");
  const [offer, setOffer] = useState(() => initialProfile().offer);
  const [tone, setTone] = useState(() => initialProfile().tone);
  const [proof, setProof] = useState(() => initialProfile().proof);
  const [saved, setSaved] = useState("");
  const [idea, setIdea] = useState("fixed-price websites that ship in two weeks");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "exported" | "error">("idle");
  const [scriptOverrides, setScriptOverrides] = useState<ScriptOverrides>({});
  const [sceneChoices, setSceneChoices] = useState<SceneChoice[]>(() => Array.from({ length: 5 }, () => ({ kind: "auto-ai" })));
  const [selectedScene, setSelectedScene] = useState(0);
  const [sceneAssets, setSceneAssets] = useState<Array<StockAsset | null>>([]);
  const [assetLoading, setAssetLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [captionMode, setCaptionMode] = useState<CaptionMode>("auto");
  const [platform, setPlatform] = useState<PlatformId>("tiktok");
  const [creditOn, setCreditOn] = useState(false);
  const [queueText, setQueueText] = useState(() => {
    try {
      return localStorage.getItem(WEEK_KEY) ?? "";
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
  const projectDraft = { version: 1 as const, idea, profile, scriptOverrides, sceneChoices, captionMode, captionOverrides, voiceOn, visualEffect, platform, credit: creditOn, pack: packId, timing: localStorage.getItem("clipflow.wordtimes") };
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
    if (project.timing) localStorage.setItem("clipflow.wordtimes", project.timing); else localStorage.removeItem("clipflow.wordtimes");
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
      markMilestone(store(), "firstVisit");
    } catch {
      // Instrumentation never breaks the editor.
    }
    const session = readSession();
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
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        version: 1, idea, scriptOverrides, sceneChoices,
        captionMode, captionOverrides, voiceOn, visualEffect, platform, credit: creditOn, pack: packId,
      }));
    } catch {
      // Session restore is convenience; the editor works without it.
    }
  }, [idea, scriptOverrides, sceneChoices, captionMode, captionOverrides, voiceOn, visualEffect, platform, creditOn, packId]);

  useEffect(() => {
    try {
      localStorage.setItem(WEEK_KEY, queueText);
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

  const timing = useMemo(() => hasScriptOverrides(scriptOverrides) ? null : readWordTiming(idea, profile), [idea, profile, scriptOverrides]);
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
  const resolvedChoices = useMemo(() => resolveSceneChoices(sceneChoices, aiSuggestions, STOCK_POOL), [sceneChoices, aiSuggestions]);

  async function loadSceneAsset(choice: ResolvedSceneChoice): Promise<StockAsset | null> {
    if (choice.kind === "upload") {
      const cached = uploadsRef.current.get(choice.id);
      if (cached) return cached;
      // Rehydrate: uploads persist in OPFS, so a reload or a reopened
      // project recovers its media instead of silently losing footage.
      try {
        const blob = await loadUploadBlob(choice.id);
        if (!blob) return null;
        const bmp = await createImageBitmap(blob);
        const asset: StockAsset = { kind: "image", src: `upload:${choice.id}`, el: bmp, keywords: [] };
        uploadsRef.current.set(choice.id, asset);
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
      setSceneChoices((choices) => choices.map((choice, index) => index === selectedScene ? { kind: "upload", id, approvedProof: false } : choice));
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
        markMilestone(store(), "firstPreview");
      } catch {
        // Instrumentation never breaks the editor.
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [script, words, captions, timing, selectedScene, sceneAssets, sceneChoices, visualEffect, preset]);

  function onSave() {
    try {
      saveProfile(store(), { niche, audience, offer, tone, proof });
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
            const target = Math.round((timing?.total ?? VIDEO_SECS) * KOKORO_SAMPLE_RATE);
            if (raw.length > target) {
              const secs = (raw.length / KOKORO_SAMPLE_RATE).toFixed(1);
              setVoiceWarn(`Voice ran ${secs}s — trimmed to ${VIDEO_SECS}s video. Shorten the idea for a perfect fit.`);
              pcm = raw.slice(0, target);
            } else if (raw.length < target) {
              const fitted = new Float32Array(target);
              fitted.set(raw, 0);
              pcm = fitted;
            } else {
              pcm = raw;
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
        const exportCaptions = synthesizedCues
          ? makeCaptionPlan({
              mode: captionMode,
              voiceOn,
              labels: captionLabels,
              words: exportWords,
              scenes: script.cues.map((cue, index) => ({ ...cue, ...timing?.windows?.[index] })),
            })
          : captions;
        if (desktop) {
          exportAbortRef.current.signal.throwIfAborted();
          // The Rust WAV sink is pinned to 16 kHz (src-tauri/src/render.rs);
          // Kokoro speaks 24 kHz — downsample once here, FFmpeg muxes it.
          if (pcm) pcm = resampleLinear(pcm, KOKORO_SAMPLE_RATE, 16000);
          const baseDuration = timing?.total ?? VIDEO_SECS;
          const totalDuration = baseDuration + (creditOn ? CREDIT_SECS : 0);
          const baseFrames = planFrames(script, 30, timing?.windows ?? null, approvedProofByCue, cueAssets);
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
          if (output) { setNativeOutput(output); setStatus("exported"); setExportMsg(""); try { recordExport(store(), Date.now()); } catch { /* instrumentation never breaks export */ } }
          else { setStatus("idle"); setExportMsg(""); }
          return;
        }
        setExportMsg("Muxing clipflow-916.mp4…");
        // Encode off the main thread: this thread draws frames (video
        // elements can't cross the boundary) and transfers each finished
        // frame to the worker, which encodes + muxes. Backpressure via the
        // worker queue keeps memory flat; periodic yields keep the UI alive.
        const withAudio = Boolean(voiceOn && pcm);
        const worker = new Worker(new URL("./lib/export-worker.ts", import.meta.url), { type: "module" });
        let buffer: ArrayBuffer;
        // Stall watchdog: a hung encoder used to look identical to a slow
        // one. After 45s without a worker message, say so and name the way
        // out instead of spinning forever.
        let lastWorkerMsgAt = Date.now();
        const watchdog = setInterval(() => {
          const silentSec = Math.round((Date.now() - lastWorkerMsgAt) / 1000);
          if (silentSec >= 45) {
            setExportMsg(`Still encoding — no encoder response for ${silentSec}s. If this persists, restart Chrome or use the desktop app.`);
          }
        }, 5000);
        try {
          buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            let lastQueue = 0;
            let gate: (() => void) | null = null;
            let settled = false;
            const release = () => {
              const pending = gate;
              gate = null;
              if (pending) pending();
            };
            const fail = (error: unknown) => {
              if (settled) return;
              settled = true;
              release();
              reject(error instanceof Error ? error : new Error(String(error)));
            };
            worker.onmessage = (event: MessageEvent<FromWorker>) => {
              const message = event.data;
              lastWorkerMsgAt = Date.now();
              if (message.type === "accepted") {
                lastQueue = message.queue;
                if (message.queue <= RESUME_QUEUE) release();
              } else if (message.type === "stage") {
                setExportMsg(
                  message.stage === "flushing-video" ? "Flushing video encoder…"
                  : message.stage === "flushing-audio" ? "Flushing voice encoder…"
                  : "Finalizing MP4…",
                );
              } else if (message.type === "done") {
                if (settled) return;
                settled = true;
                release();
                resolve(message.buffer);
              } else if (message.type === "error") {
                fail(new Error(message.message));
              }
            };
            worker.onerror = (event) => fail(event instanceof ErrorEvent ? event.message : "Export worker failed.");
            exportAbortRef.current?.signal.addEventListener("abort", () => {
              try {
                worker.postMessage({ type: "abort" });
              } catch {
                // Terminate below still releases the worker.
              }
              fail(new DOMException("Export cancelled.", "AbortError"));
            }, { once: true });
            void (async () => {
              try {
                worker.postMessage({ type: "init", voice: withAudio });
                const canvas = document.createElement("canvas");
                canvas.width = OUT_W;
                canvas.height = OUT_H;
                const ctx = canvas.getContext("2d");
                if (!ctx) throw new Error("E_CANVAS: 2d context unavailable");
                const frames: PlannedFrame[] = planFrames(script, 30, timing?.windows ?? null, approvedProofByCue, cueAssets);
                const assetByCue = new Map<number, StockAsset | null>();
                script.cues.forEach((_cue, i) => assetByCue.set(i, cueAssets[i] ?? null));
                const baseDuration = timing?.total ?? VIDEO_SECS;
                const totalDuration = baseDuration + (creditOn ? CREDIT_SECS : 0);
                const totalFrames = frames.length + (creditOn ? Math.round(CREDIT_SECS * 30) : 0);
                const postFrame = async (vf: VideoFrame, keyFrame: boolean) => {
                  try {
                    worker.postMessage({ type: "frame", frame: vf, keyFrame }, [vf]);
                  } catch (postError) {
                    try {
                      vf.close();
                    } catch {
                      // Release is best-effort; the post error carries the failure.
                    }
                    throw postError;
                  }
                  n++;
                  if (n % 90 === 0) {
                    setExportProgress(65 + Math.round((30 * n) / totalFrames));
                    setExportMsg(`Muxing ${n}/${totalFrames} frames…`);
                  }
                  if (lastQueue > MAX_QUEUE) await new Promise<void>((resume) => {
                    gate = resume;
                  });
                  if (n % 30 === 0) await new Promise((paint) => setTimeout(paint, 0));
                };
                let n = 0;
                for (const f of frames) {
                  exportAbortRef.current?.signal.throwIfAborted();
                  const idx = cueIndexOf(script, f.cue);
                  const asset = assetByCue.get(idx) ?? null;
                  if (asset?.kind === "video") {
                    const video = asset.el as HTMLVideoElement;
                    video.pause();
                    // Keep local stock video moving continuously across scene cuts.
                    // Resetting to scene-local time made every beat reuse the same opening angle.
                    const seek = Number.isFinite(video.duration) && video.duration > 0
                      ? f.t % video.duration : f.t;
                    await seekVideo(video, seek);
                  }
                  const extra: RenderExtra = {};
                  extra.visualEffect = visualEffect;
                  extra.captions = exportCaptions;
                  extra.captionAnchor = preset.captionAnchor;
                  if (exportWords) extra.words = exportWords;
                  if (asset) extra.asset = asset;
                  drawFrame(ctx as DrawCtx, f, theme, OUT_W, OUT_H, extra, totalDuration);
                  const vf = new VideoFrame(canvas, { timestamp: Math.round(f.t * 1e6) });
                  await postFrame(vf, f.t < 1);
                }
                if (creditOn) {
                  const cardFrames = Math.round(CREDIT_SECS * 30);
                  for (let i = 0; i < cardFrames; i++) {
                    exportAbortRef.current?.signal.throwIfAborted();
                    const t = baseDuration + i / 30;
                    drawFrame(ctx as DrawCtx, { t, cue: script.cues[script.cues.length - 1]! }, theme, OUT_W, OUT_H, { endCard: true }, totalDuration);
                    const vf = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6) });
                    await postFrame(vf, i === 0);
                  }
                }
                if (withAudio && pcm) {
                  // Chrome only encodes AAC at 44.1/48 kHz — Kokoro speaks
                  // 24 kHz, so upsample here. The desktop FFmpeg path gets a
                  // 16 kHz downsample instead (Rust sink is pinned).
                  const voice = resampleLinear(pcm, KOKORO_SAMPLE_RATE, AUDIO_CONFIG.sampleRate);
                  const CHUNK = 1_000_000;
                  for (let off = 0; off < voice.length; off += CHUNK) {
                    exportAbortRef.current?.signal.throwIfAborted();
                    const slice = voice.slice(off, off + CHUNK);
                    const ad = new AudioData({
                      format: "f32",
                      sampleRate: AUDIO_CONFIG.sampleRate,
                      numberOfFrames: slice.length,
                      numberOfChannels: 1,
                      timestamp: Math.round((off * 1e6) / AUDIO_CONFIG.sampleRate),
                      data: slice,
                    });
                    try {
                      worker.postMessage({ type: "audio", data: ad }, [ad]);
                    } catch (postError) {
                      try {
                        ad.close();
                      } catch {
                        // Release is best-effort.
                      }
                      throw postError;
                    }
                  }
                }
                worker.postMessage({ type: "finish" });
              } catch (error) {
                fail(error);
              }
            })();
          });
        } finally {
          clearInterval(watchdog);
          worker.terminate();
        }
        setExportProgress(100);
        setExportMsg("");
        const blob = new Blob([buffer], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        setExportUrl(url);
        try {
          recordExport(store(), Date.now());
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
            <span className="cf-kicker">A SMALL STUDIO FOR BIG IDEAS</span>
            <h1>Your idea.<br /><em>A video worth posting.</em></h1>
            <p>Shape the story, choose a visual world, then export a vertical video. All in one focused flow.</p>
          </div>
          <div className="cf-hero-index">01 / 04 <span>FROM IDEA TO FILE</span></div>
        </section>

        <nav className="cf-flow-nav" aria-label="Workflow steps">
          <a href="#idea"><span>01</span> IDEA</a><a href="#script"><span>02</span> SCRIPT</a><a href="#visuals"><span>03</span> VISUALS</a><a href="#export"><span>04</span> EXPORT</a>
        </nav>

        <div className="cf-workspace">
          <div className="cf-editor-column">
            <section className="cf-idea-panel" id="idea">
              <div className="cf-panel-heading"><span className="cf-kicker">START HERE / 01</span><h2>What's the idea?</h2><p>One sentence is enough. We'll turn it into five editable beats.</p></div>
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
              <div className="cf-panel-heading"><span className="cf-kicker">STORY STRUCTURE / 02</span><h2>Make every beat count.</h2><p>Edit a line, then select it to inspect its frame. This script drives the narration, captions, and post copy.</p></div>
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
            <SceneTray selected={selectedScene} choice={sceneChoices[selectedScene]!} suggestion={aiSuggestions[selectedScene]!} asset={sceneAssets[selectedScene] ?? null} loading={assetLoading} disabled={isWorking}
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
