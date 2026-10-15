import { useCallback, useEffect, useRef, useState } from "react";
import { makeCaptionPlan, type CaptionMode, type CaptionPhrase } from "../../shared/caption-plan";
import type { VisualEffect } from "../../shared/visual-effects";
import { cueIndexOf } from "../lib/app-utils";
import { recordExport } from "../lib/activation";
import { OUT_NAME, runBrowserExport } from "../lib/browser-export";
import { STOCK_POOL, type StockAsset } from "../lib/broll";
import { assignAiBackgrounds } from "../lib/ai-backgrounds";
import { desktop } from "../lib/desktop";
import { renderDesktop } from "../lib/desktop-render";
import { probeAudioConfig, probeVideoConfig } from "../lib/export-worker-protocol";
import { planFrames, planWordsTimed, voiceGridFromCues, VIDEO_SECS, type PlannedFrame, type TimedCueTiming, type WordCue } from "../lib/planner";
import { CREDIT_SECS } from "../lib/render";
import { resolveSceneChoices, type ResolvedSceneChoice, type SceneChoice } from "../lib/scene-assets";
import type { WordTiming } from "../lib/session";
import { browserStorage } from "../lib/storage";
import type { VideoScript } from "../lib/script";
import type { Theme } from "../lib/packs";
import { checkVoiceAssets, createKokoroLoader, KOKORO_SAMPLE_RATE, resampleLinear } from "../lib/tts-local";
import { createKokoroTimedLoader } from "../lib/tts-timed";

export type ExportStatus = "idle" | "working" | "exported" | "error";

/**
 * Everything an export needs from the editor, resolved by the shell at call
 * time. The controller never reads React state directly, which keeps it free
 * of stale-closure bugs and makes the payload explicit.
 */
export interface ExportContext {
  script: VideoScript | null;
  theme: Theme;
  /** Y anchor for captions, from the platform preset. */
  captionAnchor: number;
  visualEffect: VisualEffect;
  captions: CaptionPhrase[];
  words: WordCue[] | undefined;
  captionLabels: string[];
  captionMode: CaptionMode;
  voiceOn: boolean;
  creditOn: boolean;
  /** Voice-timed sidecar for this idea+profile, or null when edited. */
  timing: WordTiming | null;
  sceneChoices: SceneChoice[];
  aiSuggestions: ReturnType<typeof assignAiBackgrounds>;
  loadSceneAsset: (choice: ResolvedSceneChoice) => Promise<StockAsset | null>;
}

/**
 * ExportController: owns export lifecycle state (status, progress, message,
 * download URL, voice warning, native output) plus cancellation and the
 * orchestration of one export run — capability probes, local TTS, per-export
 * caption/window derivation, then the desktop (FFmpeg) or browser (worker)
 * renderer. App only supplies an ExportContext and wires the result to the UI.
 */
export function useExportController(setErr: (message: string) => void) {
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [exportMsg, setExportMsg] = useState("");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [voiceWarn, setVoiceWarn] = useState("");
  const [nativeOutput, setNativeOutput] = useState<string | null>(null);
  const busyRef = useRef(false);
  const exportAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { if (exportUrl) URL.revokeObjectURL(exportUrl); }, [exportUrl]);

  /** Back to a clean slate (used when a project is restored or created). */
  const reset = useCallback(() => {
    setStatus("idle");
    setExportMsg("");
    setExportProgress(0);
    setExportUrl(null);
    setVoiceWarn("");
    setNativeOutput(null);
  }, []);

  /** Cancel the in-flight export; the controller surfaces an AbortError. */
  const cancel = useCallback(() => {
    exportAbortRef.current?.abort();
  }, []);

  const runExport = useCallback(async (ctx: ExportContext): Promise<void> => {
    const { script, theme, captionAnchor, visualEffect, captions, words, captionLabels, captionMode, voiceOn, creditOn, timing, sceneChoices, aiSuggestions, loadSceneAsset } = ctx;
    if (!script) return;
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // Capability probe first: fail fast with a named cause instead of
      // dying mid-export. The desktop app (FFmpeg) is the universal fallback.
      // Audio is soft-failed: Firefox has no AAC encoder, so a refused voice
      // config exports silently (with a warning) instead of erroring out.
      let voiceEffective = voiceOn;
      let audioFallbackWarn = "";
      if (!desktop) {
        const videoProbe = await probeVideoConfig();
        if (!videoProbe.supported) {
          setStatus("error");
          setErr(videoProbe.reason === "missing"
            ? "This browser can't hardware-encode — open in Chrome/Edge, or use the desktop app."
            : "This browser refused the 720x1280 H.264 export config — update Chrome/Edge, or use the desktop app.");
          return;
        }
        if (voiceEffective && typeof AudioData === "undefined") {
          voiceEffective = false;
          audioFallbackWarn = "This browser can't encode voice audio — exported silently. For voice, use Chrome/Edge or the desktop app.";
        } else if (voiceEffective) {
          const audioProbe = await probeAudioConfig();
          if (!audioProbe.supported) {
            voiceEffective = false;
            audioFallbackWarn = audioProbe.reason === "missing"
              ? "This browser can't encode voice audio — exported silently. For voice, use Chrome/Edge or the desktop app."
              : "This browser refused the voice export config (Firefox has no AAC encoder) — exported silently. For voice, use Chrome/Edge or the desktop app.";
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
      setVoiceWarn(audioFallbackWarn);
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
        if (voiceEffective) {
          const cueTexts = script.cues.map((cue) => cue.text);
          setExportMsg("Rendering voice… (local AI voice can pause the UI for a bit)");
          setExportProgress(50);
          // Yield so the progress paint lands before the heavyweight local
          // model blocks the main thread (same freeze in browser + desktop).
          await new Promise((paint) => setTimeout(paint, 50));
          try {
            // Fail fast before the heavyweight model imports: a missing
            // install or an offline first run surfaces here with an
            // actionable message instead of a late init failure. The
            // timestamped model stays a soft fallback below.
            const voiceAssets = await checkVoiceAssets();
            if (!voiceAssets.ready) {
              throw new Error(
                `E_TTS_MODEL: voice ${voiceAssets.missing.join(" + ")} missing — run \`npm run model:install\`, then export again.`,
              );
            }
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
              const trimWarn = `Voice ran ${secs}s — trimmed to ${VIDEO_SECS}s video. Shorten the idea for a perfect fit.`;
              setVoiceWarn((prev) => (prev ? `${prev} ${trimWarn}` : trimWarn));
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
              voiceOn: voiceEffective,
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
            extra: { captions: exportCaptions, words: exportWords, visualEffect, captionAnchor }, duration: totalDuration,
            endCardAfter: creditOn ? baseDuration : undefined, pcm, signal: exportAbortRef.current.signal,
            cueIndex: frame => cueIndexOf(script, frame.cue),
            progress: (percent,message) => { setExportProgress(percent); setExportMsg(message); },
          });
          if (output) { setNativeOutput(output); setStatus("exported"); setExportMsg(""); try { recordExport(browserStorage, Date.now()); } catch { /* instrumentation never breaks export */ } }
          else { setStatus("idle"); setExportMsg(""); }
          return;
        }
        const buffer = await runBrowserExport({
          script,
          theme,
          visualEffect,
          captionAnchor,
          captions: exportCaptions,
          words: exportWords,
          windows: exportWindows,
          baseDuration,
          creditOn,
          voiceOn: voiceEffective,
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
          recordExport(browserStorage, Date.now());
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
  }, [setErr]);

  return { status, exportMsg, exportProgress, exportUrl, voiceWarn, nativeOutput, busyRef, exportAbortRef, reset, cancel, runExport };
}
