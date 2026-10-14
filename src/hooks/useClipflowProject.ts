import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CaptionMode, CaptionPhrase } from "../../shared/caption-plan";
import { isPlatformId, type PlatformId } from "../../shared/platform-presets";
import type { VisualEffect } from "../../shared/visual-effects";
import { cueIndexOf } from "../lib/app-utils";
import { markMilestone } from "../lib/activation";
import { desktop, confirmDiscard, importNativeMedia, initialDesktopProject, openDesktopProject, projectFingerprint, saveDesktopProject, type DesktopProjectV1 } from "../lib/desktop";
import { PACK_IDS, type PackId, type Theme } from "../lib/packs";
import { planFrames, VIDEO_SECS } from "../lib/planner";
import { loadInitialProfile, saveProfile } from "../lib/profile";
import type { SceneChoice } from "../lib/scene-assets";
import type { ScriptOverrides } from "../lib/script-draft";
import type { VideoScript } from "../lib/script";
import { defaultApprovedShots, planInputsSig, readSession, validApprovedShots, validPlanSeeds, writeSession, writeWordTiming, readTimingSidecar, validTimingSidecar, type SessionSnapshot, type WordTiming } from "../lib/session";
import type { StockAsset } from "../lib/broll";
import { browserStorage as storage } from "../lib/storage";
import { gcUploads } from "../lib/upload-store";
import { WEEK_KEY } from "../lib/week-queue";

/** Derived render inputs the save action needs, read fresh at action time. */
export interface ProjectSaveContext {
  script: VideoScript | null;
  generatedScript: VideoScript | null;
  theme: Theme;
  captions: CaptionPhrase[];
  timing: WordTiming | null;
  sceneAssets: Array<StockAsset | null>;
}

export interface ClipflowProjectOptions {
  /** Derived inputs for `save`, read at action time (never a stale closure). */
  getSaveContext: () => ProjectSaveContext | null;
  /** Clears transient export state (status, download URL, native output). */
  onRestored: () => void;
  /** Shell error line: cleared on restore/load, written by other modules. */
  setErr: (message: string) => void;
  /** True while an export owns the editor (project actions must stand down). */
  isExporting: () => boolean;
  /** Export handles used by the native close guard. */
  exportBusyRef: MutableRefObject<boolean>;
  exportAbortRef: MutableRefObject<AbortController | null>;
}

/**
 * useClipflowProject: the editable document (idea, profile, pack, beats,
 * scene choices, captions, voice/platform options, weekly queue) plus its
 * lifecycle — dirty tracking, browser session restore/persist, native
 * open/save/new/import, the close guard and Ctrl+S/O/N.
 *
 * Derived render inputs (script, captions, timing) stay outside: App computes
 * them from what this hook returns and feeds them back through
 * `getSaveContext` only when the save action runs.
 */
export function useClipflowProject(options: ClipflowProjectOptions) {
  const { getSaveContext, onRestored, setErr, isExporting, exportBusyRef, exportAbortRef } = options;

  // --- Project lifecycle state ---------------------------------------------
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectError, setProjectError] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [projectBase, setProjectBase] = useState<{ idea: string; profile: string; script: VideoScript } | null>(null);

  // --- Document state -------------------------------------------------------
  // A single read feeds every profile-backed field: loadInitialProfile falls
  // back to the default profile when the persisted one is absent or unreadable.
  const initialProfile = useMemo(() => loadInitialProfile(storage), []);
  const [niche, setNiche] = useState(initialProfile.niche);
  const [audience, setAudience] = useState(initialProfile.audience);
  const [offer, setOffer] = useState(initialProfile.offer);
  const [tone, setTone] = useState(initialProfile.tone);
  const [proof, setProof] = useState(initialProfile.proof);
  const [saved, setSaved] = useState("");
  const [packId, setPackId] = useState<PackId>("mstudio");
  const [idea, setIdea] = useState("fixed-price websites that ship in two weeks");
  const [scriptOverrides, setScriptOverrides] = useState<ScriptOverrides>({});
  const [sceneChoices, setSceneChoices] = useState<SceneChoice[]>(() => Array.from({ length: 5 }, () => ({ kind: "auto-ai" })));
  // AI Director plan takes: per-shot regenerate seeds + per-shot approvals.
  // Both reset whenever the script inputs change (effect below) — a stale
  // approval must never survive a new script.
  const [planSeeds, setPlanSeeds] = useState<Record<number, number>>({});
  const [approvedShots, setApprovedShots] = useState<boolean[]>(() => defaultApprovedShots());
  // Signature of the script inputs at the last restore (browser session or
  // native project). The reset effect skips while the live inputs still
  // match it, so restored takes survive the post-restore refire — see the
  // reset effect below.
  const restoredPlanSigRef = useRef<string | null>(null);
  const [selectedScene, setSelectedScene] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [captionMode, setCaptionMode] = useState<CaptionMode>("auto");
  const [captionOverrides, setCaptionOverrides] = useState<Record<number, string>>({});
  const [platform, setPlatform] = useState<PlatformId>("tiktok");
  const [creditOn, setCreditOn] = useState(false);
  const [visualEffect, setVisualEffect] = useState<VisualEffect>("none");
  const [queueText, setQueueText] = useState(() => {
    try {
      return storage.getItem(WEEK_KEY) ?? "";
    } catch {
      return "";
    }
  });

  // Timing sidecar as state, not a render-time storage read: the store is
  // touched once here (lazily) and on project restore below — never during
  // render — so a storage failure degrades to null timing instead of
  // coupling React rendering to persistence.
  const [sidecarTiming, setSidecarTiming] = useState<string | null>(() => readTimingSidecar(storage));

  const profile = useMemo(() => ({ niche, audience, offer, tone, proof }), [niche, audience, offer, tone, proof]);
  const projectDraft = { version: 1 as const, idea, profile, scriptOverrides, sceneChoices, captionMode, captionOverrides, voiceOn, visualEffect, platform, credit: creditOn, pack: packId, timing: sidecarTiming, planSeeds, approvedShots };
  const projectSnapshot = projectFingerprint(projectDraft);
  const projectDirty = projectSnapshot !== savedSnapshot;

  // --- Restore --------------------------------------------------------------
  function restoreProject(project: DesktopProjectV1, path: string | null) {
    if (project.version !== 1 || !Array.isArray(project.sceneChoices) || project.sceneChoices.length !== 5 || typeof project.idea !== "string" || !project.profile || !project.scriptOverrides || !project.captionOverrides) throw new Error("Invalid Clipflow project.");
    setIdea(project.idea); setNiche(project.profile.niche); setAudience(project.profile.audience); setOffer(project.profile.offer); setTone(project.profile.tone); setProof(project.profile.proof);
    if (project.baseScript && (!Array.isArray(project.baseScript.cues) || project.baseScript.cues.length !== 5)) throw new Error("The saved script has an invalid scene plan.");
    setProjectBase(project.baseScript ? { idea: project.idea, profile: projectFingerprint(project.profile), script: project.baseScript } : null);
    setScriptOverrides(project.scriptOverrides); setSceneChoices(project.sceneChoices); setCaptionMode(project.captionMode); setCaptionOverrides(project.captionOverrides); setVoiceOn(project.voiceOn); setVisualEffect(project.visualEffect ?? "none");
    if (isPlatformId(project.platform)) setPlatform(project.platform);
    setCreditOn(project.credit === true);
    if (typeof project.pack === "string" && (PACK_IDS as readonly string[]).includes(project.pack)) {
      setPackId(project.pack as PackId);
      setProjectBase(null);
    }
    // AI Director plan takes travel with the project (optional: pre-plan
    // files still open). Same guards as the browser session — bad keys or
    // a bad array degrade to defaults while a malformed core above still
    // throws as before.
    const incomingPlanSeeds = validPlanSeeds(project.planSeeds);
    const incomingApprovals = validApprovedShots(project.approvedShots);
    setPlanSeeds(incomingPlanSeeds);
    setApprovedShots(incomingApprovals);
    // The native restore lands input state the reset effect watches: record
    // its signature (effective pack — an unknown pack keeps the live one)
    // so the post-restore refire settles instead of wiping restored takes.
    const effectivePack =
      typeof project.pack === "string" && (PACK_IDS as readonly string[]).includes(project.pack)
        ? project.pack
        : packId;
    restoredPlanSigRef.current = planInputsSig({
      idea: project.idea,
      profile: project.profile,
      scriptOverrides: project.scriptOverrides,
      pack: effectivePack,
    });
    // Incoming timing is validated before it touches state, storage or the
    // saved snapshot: a corrupt blob from a project file degrades to null
    // everywhere at once instead of persisting and flapping the dirty flag.
    const incomingTiming = validTimingSidecar(project.timing) ? project.timing : null;
    writeWordTiming(storage, incomingTiming);
    setSidecarTiming(incomingTiming);
    const { savedAt: _savedAt, ...draft } = project;
    // Normalized with the plan defaults above: opening a pre-plan file must
    // settle clean, not flag dirty against the live draft's plan fields.
    setSavedSnapshot(projectFingerprint({ ...draft, planSeeds: incomingPlanSeeds, approvedShots: incomingApprovals, timing: incomingTiming })); setProjectPath(path); setSelectedScene(0); onRestored(); setErr("");
  }

  // --- Desktop actions ------------------------------------------------------
  async function desktopAction(action: "open" | "save" | "import" | "new") {
    if (projectBusy || isExporting()) return;
    if ((action === "open" || action === "new") && projectDirty && !await confirmDiscard("Discard unsaved project changes? Save your project first to keep them.")) return;
    setProjectBusy(true); setProjectError("");
    try {
      if (action === "save") {
        const ctx = getSaveContext();
        if (!ctx) throw new Error("Editor not ready — wait for the first render, then save again.");
        const { script, generatedScript, theme, captions, timing, sceneAssets } = ctx;
        const savedFrames = script ? planFrames(script, 30, timing?.windows ?? null, sceneChoices.map((choice, index) => choice.kind === "upload" && choice.approvedProof === true && sceneAssets[index]?.src === `upload:${choice.id}`), sceneAssets) : [];
        const renderPlan = script ? { renderer: "canvas-v1", fps: 30, duration: timing?.total ?? VIDEO_SECS, theme, captions,
          timingSource: timing ? "measured" : "estimated", scenes: script.cues.map((cue, index) => {
            const frame = savedFrames.find(frame => cueIndexOf(script, frame.cue) === index);
            return { ...cue, ...timing?.windows?.[index], motionIntent: frame?.motionIntent, motionLabels: frame?.motionLabels };
          }) } : null;
        const result = await saveDesktopProject({ ...projectDraft, baseScript: generatedScript, renderPlan, savedAt: new Date().toISOString() });
        if (result) { setSceneChoices(result.project.sceneChoices); setProjectPath(result.path); const { savedAt: _savedAt, ...draft } = result.project; setSavedSnapshot(projectFingerprint(draft)); }
      } else if (action === "open") {
        const result = await openDesktopProject(); if (result) restoreProject(result.project, result.path);
      } else if (action === "new") {
        restoreProject({ version: 1, idea: "", profile, scriptOverrides: {}, sceneChoices: Array.from({ length: 5 }, () => ({ kind: "auto-ai" })), captionMode: "auto", captionOverrides: {}, voiceOn: false, visualEffect: "none", timing: null, savedAt: "" }, null);
      } else {
        const media = await importNativeMedia();
        if (media) setSceneChoices(current => current.map((choice, index) => index === selectedScene ? media : choice));
      }
    } catch (error) { setProjectError(error instanceof Error ? error.message : String(error)); }
    finally { setProjectBusy(false); }
  }

  function onSaveProfile() {
    setSaved(saveProfile(storage, profile) ? "Saved." : "Storage quota exceeded — profile not saved.");
  }

  // --- Lifecycle effects ----------------------------------------------------
  // Plan takes follow the script: any script-input change invalidates
  // regenerated takes and their approvals. An effect (not render-time
  // resets) because invalidation lives in App's handlers, not this hook.
  // Profile is included: buildScript derives the script from it too.
  //
  // Declared FIRST on purpose (approach (a): restore-after-reset). On mount
  // this runs before the restores below — a no-op over defaults — and the
  // restore wins the batch. Restores record their input signature in
  // `restoredPlanSigRef`; the post-restore refire (restored idea/pack
  // landing) sees the live inputs still match and skips, so restored
  // approvals survive. Any later genuine input change mismatches the
  // recorded signature, clears it, and resets as before. Effect-ordering
  // proof: `src/lib/session.test.ts` replays this exact timeline against
  // `planInputsSig` (mount → restore → refire-skip → edit-resets).
  useEffect(() => {
    const sig = planInputsSig({ idea, profile, scriptOverrides, pack: packId });
    if (restoredPlanSigRef.current !== null) {
      if (restoredPlanSigRef.current === sig) return;
      restoredPlanSigRef.current = null;
    }
    setPlanSeeds({});
    setApprovedShots(defaultApprovedShots());
  }, [idea, profile, scriptOverrides, packId]);

  // Native close: ask before dropping unsaved changes or an in-flight export.
  useEffect(() => {
    if (!desktop) return;
    const nativeWindow = getCurrentWindow();
    const listener = nativeWindow.onCloseRequested(async event => {
      if (!projectDirty && !exportBusyRef.current) return;
      event.preventDefault();
      const message = exportBusyRef.current ? "Close Clipflow and cancel the current export? Unsaved changes will be lost." : "Close Clipflow without saving project changes?";
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
  // through loadSceneAsset on the resolved-choices effect).
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
    setPlanSeeds(session.planSeeds ?? {});
    setApprovedShots(session.approvedShots ?? defaultApprovedShots());
    // The session lands input state the reset effect (above) watches:
    // record its signature so the post-restore refire settles instead of
    // wiping the restored takes. Session carries no profile — the live
    // (initial) profile is the effective one.
    restoredPlanSigRef.current = planInputsSig({
      idea: session.idea,
      profile,
      scriptOverrides: session.scriptOverrides,
      pack: session.pack,
    });
    setProjectBase(null);
  }, []);

  useEffect(() => {
    if (desktop) return;
    writeSession(storage, { idea, scriptOverrides, sceneChoices, captionMode, captionOverrides, voiceOn, visualEffect, platform, credit: creditOn, pack: packId, planSeeds, approvedShots } satisfies SessionSnapshot);
  }, [idea, scriptOverrides, sceneChoices, captionMode, captionOverrides, voiceOn, visualEffect, platform, creditOn, packId, planSeeds, approvedShots]);

  useEffect(() => {
    try {
      storage.setItem(WEEK_KEY, queueText);
    } catch {
      // Queue persistence is convenience; the editor works without it.
    }
  }, [queueText]);

  // Ctrl+S/O/N on desktop (registered every render so actions see fresh state).
  useEffect(() => {
    if (!desktop) return;
    const key = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey) return;
      const action = ({ s: "save", o: "open", n: "new" } as const)[event.key.toLowerCase() as "s" | "o" | "n"];
      if (action) { event.preventDefault(); void desktopAction(action); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  return {
    // document
    idea, setIdea,
    packId, setPackId,
    profile,
    saved, onSaveProfile,
    scriptOverrides, setScriptOverrides,
    sceneChoices, setSceneChoices,
    planSeeds, setPlanSeeds,
    approvedShots, setApprovedShots,
    selectedScene, setSelectedScene,
    voiceOn, setVoiceOn,
    captionMode, setCaptionMode,
    captionOverrides, setCaptionOverrides,
    platform, setPlatform,
    creditOn, setCreditOn,
    visualEffect, setVisualEffect,
    queueText, setQueueText,
    niche, setNiche, audience, setAudience, offer, setOffer, tone, setTone, proof, setProof,
    // project lifecycle
    projectBase, setProjectBase,
    projectPath, projectBusy, projectError, projectDirty,
    desktopAction,
  };
}
