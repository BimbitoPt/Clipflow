import { useEffect, useMemo, useRef, useState } from "react";
import { loadPack, type Theme } from "./lib/packs";
import { MSTUDIO_PROFILE, loadProfile, saveProfile, type Profile } from "./lib/profile";
import { buildScript } from "./lib/script";
import { planFrames, planWordsTimed, VIDEO_SECS, type PlannedFrame, type TimedCueTiming } from "./lib/planner";
import { drawFrame, type DrawCtx, type RenderExtra } from "./lib/render";
import { preloadAsset, STOCK_POOL, type StockAsset } from "./lib/broll";
import { AI_BACKGROUNDS, assignAiBackgrounds } from "./lib/ai-backgrounds";
import { resolveSceneChoices, type ResolvedSceneChoice, type SceneChoice } from "./lib/scene-assets";
import { applyScriptOverrides, hasScriptOverrides, type ScriptOverrides } from "./lib/script-draft";
import { previewSpeak } from "./lib/tts";
import { createSpeechT5Loader } from "./lib/tts-local";
import ProfileSettings from "./components/ProfileSettings";
import ScriptBeats from "./components/ScriptBeats";
import SceneTray from "./components/SceneTray";
import ExportPanel from "./components/ExportPanel";

const pack = loadPack("mstudio");
const theme: Theme = pack.themes[0]!;

const OUT_W = 720, OUT_H = 1280, OUT_BITRATE = 5_000_000, OUT_NAME = "clipflow-916.mp4";

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
  const [niche, setNiche] = useState(() => initialProfile().niche);
  const [audience, setAudience] = useState(() => initialProfile().audience);
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
  const [exportMsg, setExportMsg] = useState("");
  const [exportProgress, setExportProgress] = useState(0);
  const [voiceWarn, setVoiceWarn] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  const uploadsRef = useRef<Map<string, StockAsset>>(new Map());

  useEffect(() => {
    return () => {
      try {
        for (const asset of uploadsRef.current.values()) if (asset.kind === "image") (asset.el as ImageBitmap).close();
      } catch {
        // close on unmount is best-effort; never throw.
      }
    };
  }, []);

  const profile = useMemo(() => ({ niche, audience, offer, tone, proof }), [niche, audience, offer, tone, proof]);
  const { generatedScript, err: generatedErr } = useMemo(() => {
    try {
      return { generatedScript: buildScript(idea, profile, pack), err: "" };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return { generatedScript: null, err: m.includes("E_EMPTY_IDEA") ? "Enter your idea above." : m };
    }
  }, [idea, profile]);
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

  const aiSuggestions = useMemo(() => assignAiBackgrounds(idea, profile, (script ?? generatedScript)?.cues.map((cue) => cue.text) ?? []), [idea, profile, script, generatedScript]);
  const resolvedChoices = useMemo(() => resolveSceneChoices(sceneChoices, aiSuggestions, STOCK_POOL), [sceneChoices, aiSuggestions]);

  async function loadSceneAsset(choice: ResolvedSceneChoice): Promise<StockAsset | null> {
    if (choice.kind === "upload") return uploadsRef.current.get(choice.id) ?? null;
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

  async function onUpload(file: File) {
    try {
      const bmp = await createImageBitmap(file);
      const id = crypto.randomUUID();
      uploadsRef.current.set(id, { kind: "image", src: `upload:${id}`, el: bmp, keywords: [] });
      setSceneChoices((choices) => choices.map((choice, index) => index === selectedScene ? { kind: "upload", id } : choice));
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
      const frames = planFrames(script, 30, timing?.windows ?? null);
      const cueFrames = frames.filter((frame) => cueIndexOf(script, frame.cue) === selectedScene);
      const frame = cueFrames[Math.floor(cueFrames.length / 2)] ?? frames[0];
      if (!frame) return;
      const extra: RenderExtra = {};
      if (words) extra.words = words;
      const asset = sceneAssets[selectedScene];
      if (asset) extra.asset = asset;
      drawFrame(ctx as DrawCtx, frame, theme, 360, 640, extra, timing?.total ?? VIDEO_SECS);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [script, words, timing, selectedScene, sceneAssets]);

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
      if (typeof VideoEncoder === "undefined") {
        setStatus("error");
        setErr("This browser can't hardware-encode — open in Chrome/Edge.");
        return;
      }
      if (voiceOn && (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined")) {
        setStatus("error");
        setErr("This browser can't encode audio — export silently or try Chrome/Edge.");
        return;
      }
      setStatus("working");
      setErr("");
      setExportMsg("Script ready.");
      setExportProgress(10);
      setVoiceWarn("");
      try {
        setExportMsg("Loading selected scene visuals…");
        setExportProgress(25);
        const cueAssets = await Promise.all(resolveSceneChoices([...sceneChoices], aiSuggestions, STOCK_POOL).map(loadSceneAsset));
        setExportProgress(35);
        let pcm: Float32Array | null = null;
        if (voiceOn) {
          const loader = createSpeechT5Loader();
          const fullText = [script.hook, ...script.beats, script.cta].join(". ");
          setExportMsg("Rendering voice…");
          setExportProgress(50);
          try {
            const raw = await loader(fullText);
            const target = Math.round((timing?.total ?? VIDEO_SECS) * 16000);
            if (raw.length > target) {
              const secs = (raw.length / 16000).toFixed(1);
              setVoiceWarn(`Voice ran ${secs}s — trimmed to ${VIDEO_SECS}s video. Shorten the idea for a perfect fit.`);
              pcm = raw.slice(0, target);
            } else if (raw.length < target) {
              const fitted = new Float32Array(target);
              fitted.set(raw, 0);
              pcm = fitted;
            } else {
              pcm = raw;
            }
            // Normalize: SpeechT5 peaks near 0.1 (whisper-quiet) — peak to
            // 0.89 so the export is audible without cranking device volume.
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
        setExportMsg("Muxing clipflow-916.mp4…");
        const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
        const muxer = voiceOn
          ? new Muxer({
              target: new ArrayBufferTarget(),
              video: { codec: "avc", width: OUT_W, height: OUT_H },
              audio: { codec: "aac", sampleRate: 16000, numberOfChannels: 1 },
              fastStart: "in-memory",
            })
          : new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width: OUT_W, height: OUT_H }, fastStart: "in-memory" });
        const canvas = document.createElement("canvas");
        canvas.width = OUT_W;
        canvas.height = OUT_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("E_CANVAS: 2d context unavailable");
        const frames: PlannedFrame[] = planFrames(script, 30, timing?.windows ?? null);
        const assetByCue = new Map<number, StockAsset | null>();
        script.cues.forEach((_cue, i) => assetByCue.set(i, cueAssets[i] ?? null));
        // Deterministic video start: seek each cue's video once before its frames.
        let encErr: unknown = null;
        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => {
            encErr = e;
          },
        });
        encoder.configure({ codec: "avc1.42001f", width: OUT_W, height: OUT_H, bitrate: OUT_BITRATE });
        let audioEncErr: unknown = null;
        let audioEncoder: AudioEncoder | null = null;
        if (voiceOn && pcm) {
          audioEncoder = new AudioEncoder({
            output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
            error: (e) => {
              audioEncErr = e;
            },
          });
          audioEncoder.configure({ codec: "mpac", sampleRate: 16000, numberOfChannels: 1, bitrate: 96000 });
        }
        try {
          let n = 0;
          for (const f of frames) {
            const idx = cueIndexOf(script, f.cue);
            const asset = assetByCue.get(idx) ?? null;
            if (asset?.kind === "video") {
              const video = asset.el as HTMLVideoElement;
              video.pause();
              const start = timing?.windows?.[idx]?.start ?? f.cue.start;
              const elapsed = Math.max(0, f.t - start);
              const seek = Number.isFinite(video.duration) && video.duration > 0
                ? elapsed % video.duration : elapsed;
              await seekVideo(video, seek);
            }
            const extra: RenderExtra = {};
            if (words) extra.words = words;
            if (asset) extra.asset = asset;
            drawFrame(ctx as DrawCtx, f, theme, OUT_W, OUT_H, extra, timing?.total ?? VIDEO_SECS);
            const vf = new VideoFrame(canvas, { timestamp: Math.round(f.t * 1e6) });
            try {
              encoder.encode(vf, { keyFrame: f.t < 1 });
            } finally {
              vf.close();
            }
            n++;
            if (n % 90 === 0) {
              setExportProgress(65 + Math.round((30 * n) / frames.length));
              setExportMsg(`Muxing ${n}/${frames.length} frames…`);
            }
          }
          await encoder.flush();
          if (encErr) throw encErr;
          if (voiceOn && pcm && audioEncoder) {
            const CHUNK = 1_000_000;
            for (let off = 0; off < pcm.length; off += CHUNK) {
              const slice = pcm.slice(off, off + CHUNK);
              const ad = new AudioData({
                format: "f32",
                sampleRate: 16000,
                numberOfFrames: slice.length,
                numberOfChannels: 1,
                timestamp: Math.round((off * 1e6) / 16000),
                data: slice,
              });
              try {
                audioEncoder.encode(ad);
              } finally {
                ad.close();
              }
            }
            await audioEncoder.flush();
            if (audioEncErr) throw audioEncErr;
          }
          muxer.finalize();
        } finally {
          if (encoder.state !== "closed") encoder.close();
          if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
        }
        setExportProgress(100);
        setExportMsg("");
        const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = OUT_NAME;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setStatus("exported");
      } catch (e) {
        setStatus("error");
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setExportProgress(0);
      }
    } finally {
      busyRef.current = false;
    }
  }

  const tiktok = script ? `${script.hook} ${pack.hashtags.join(" ")}` : "";
  const xpost = script ? `${script.hook} ${script.cta}`.slice(0, 280) : "";

  const sceneLabels = ["HOOK", "BEAT 01", "BEAT 02", "BEAT 03", "CTA"];
  const isWorking = status === "working";
  const sceneThumb = (index: number): string | undefined => {
    const choice = sceneChoices[index];
    if (choice?.kind === "auto-ai") return aiSuggestions[index]?.src;
    if (choice?.kind === "ai") return AI_BACKGROUNDS.find((item) => item.id === choice.id)?.src;
    if (choice?.kind === "stock") return choice.src;
    return undefined;
  };

  return (
    <main className="cf-app">
      <div className="cf-shell">
        <header className="cf-header">
          <a href="/" className="cf-brand" aria-label="Clipflow home"><span className="cf-brand-mark">C</span><span>CLIPFLOW</span></a>
          <span className="cf-header-label">IDEA → VIDEO STUDIO</span>
          <span className="cf-local-pill"><span /> LOCAL-FIRST</span>
        </header>

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
              <ProfileSettings profile={profile} disabled={isWorking} saved={saved} onSave={onSave} onChange={(field, value) => {
                ({ niche: setNiche, audience: setAudience, offer: setOffer, tone: setTone, proof: setProof })[field](value);
                setScriptOverrides({});
              }} />
              {err && <p role="alert" className="cf-error">{err}</p>}
            </section>
            {generatedScript && <section className="cf-script-panel" id="script">
              <div className="cf-panel-heading"><span className="cf-kicker">STORY STRUCTURE / 02</span><h2>Make every beat count.</h2><p>Edit a line, then select it to inspect its frame. This script drives the narration, captions, and post copy.</p></div>
              <ScriptBeats generated={generatedScript} overrides={scriptOverrides} selected={selectedScene} disabled={isWorking} onSelect={setSelectedScene}
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
          onExport={() => void onExport()} onCopy={(value) => void copyText(value)} status={status} progress={exportProgress} message={exportMsg} voiceWarn={voiceWarn} />}

        <footer className="cf-footer"><span>CLIPFLOW / BUILT TO KEEP IDEAS MOVING</span><a href="mailto:hello@mstudioweb.pt?subject=Clipflow%20Managed">NEED A MANAGED VIDEO PIPELINE? ↗</a></footer>
      </div>
    </main>
  );
}
