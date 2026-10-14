import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { assignAiBackgrounds, AI_BACKGROUNDS } from "../lib/ai-backgrounds";
import { preloadAsset, STOCK_POOL, type StockAsset } from "../lib/broll";
import { buildKeyframePrompt, generateKeyframe, hashSeed, keyframeId, keyframeSeedOf, keyframeUrl, loadPollinationsKey, sanitizePollinationsKey, savePollinationsKey, type KeyframeStatus } from "../lib/keyframes";
import type { Profile } from "../lib/profile";
import type { VideoScript } from "../lib/script";
import { resolveSceneChoices, applyUploadToScene, type ResolvedSceneChoice, type SceneChoice } from "../lib/scene-assets";
import { browserStorage as storage } from "../lib/storage";
import { deleteUpload, loadUploadBlob, saveUpload, touchUpload } from "../lib/upload-store";

export interface SceneAssetsOptions {
  /** Current scene choices (the hook never mutates them except through the setter). */
  sceneChoices: SceneChoice[];
  setSceneChoices: Dispatch<SetStateAction<SceneChoice[]>>;
  /** Scene the user is on — the target of a new upload. */
  selectedScene: number;
  setErr: (message: string) => void;
  aiSuggestions: ReturnType<typeof assignAiBackgrounds>;
  generatedScript: VideoScript | null;
  profile: Profile;
  idea: string;
}

/**
 * useSceneAssets: everything about scene media — the resolved asset list,
 * upload/download caches (OPFS-backed), thumbnails, disposal, the GC pass for
 * orphaned uploads, and script-driven keyframe generation.
 *
 * Generated media lives in its own maps (not `uploadsRef`) so the upload GC
 * pass never evicts an image a scene choice still points at.
 */
export function useSceneAssets(options: SceneAssetsOptions) {
  const { sceneChoices, setSceneChoices, selectedScene, setErr, aiSuggestions, generatedScript, profile, idea } = options;

  const [sceneAssets, setSceneAssets] = useState<Array<StockAsset | null>>([]);
  const [assetLoading, setAssetLoading] = useState(false);
  const [keyframeStatus, setKeyframeStatus] = useState<KeyframeStatus[]>(() => Array.from({ length: 5 }, () => "idle" as KeyframeStatus));
  const [keyframeBump, setKeyframeBump] = useState(0);
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

  const uploadsRef = useRef<Map<string, StockAsset>>(new Map());
  const uploadThumbsRef = useRef<Map<string, string>>(new Map());
  const generatedRef = useRef<Map<string, StockAsset>>(new Map());
  const generatedBlobRef = useRef<Map<string, Blob>>(new Map());
  const generatedUrlRef = useRef<Map<string, string>>(new Map());
  const keyframeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const keyframeRunRef = useRef(0);
  const sceneChoicesRef = useRef(sceneChoices);
  sceneChoicesRef.current = sceneChoices;

  // Dispose every decoded bitmap and object URL when the editor unmounts.
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

  function onPollinationsKeyChange(value: string): void {
    setPollinationsKey(value.trim());
    savePollinationsKey(storage, value);
  }

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

  // Resolve every scene's media whenever the choices change; a newer run wins.
  useEffect(() => {
    let cancelled = false;
    setAssetLoading(true);
    void Promise.all(resolvedChoices.map(loadSceneAsset)).then((assets) => {
      if (!cancelled) { setSceneAssets(assets); setAssetLoading(false); }
    });
    return () => { cancelled = true; };
  }, [resolvedChoices]);

  // Drop uploads no scene points at anymore (and not shown in the preview).
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
      let failure: string | null = null;
      setSceneChoices((choices) => {
        const result = applyUploadToScene(choices, targetScene, id);
        // The updater must stay pure (StrictMode may re-invoke it), so the
        // outcome is reported after, in the async continuation below.
        // Re-invocation is idempotent: same input, same flag value.
        if ("error" in result) {
          failure = result.error;
          return choices;
        }
        return result.choices;
      });
      if (failure) {
        setErr(failure);
        return;
      }
      setErr("");
    } catch {
      setErr("Could not load that image — try another file.");
    }
  }

  /** Thumbnail for a scene strip button: AI/stock URL, generated blob, or a downscaled upload. */
  function sceneThumb(index: number): string | undefined {
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
  }

  return {
    sceneAssets,
    assetLoading,
    loadSceneAsset,
    onUpload,
    sceneThumb,
    keyframeStatus,
    generateKeyframeNow,
    pollinationsKey,
    onPollinationsKeyChange,
  };
}
