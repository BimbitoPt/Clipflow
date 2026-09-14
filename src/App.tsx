import { useEffect, useMemo, useRef, useState } from "react";
import { loadPack, type Theme } from "./lib/packs";
import { MSTUDIO_PROFILE, loadProfile, saveProfile } from "./lib/profile";
import { buildScript } from "./lib/script";
import { planFrames, planWords, VIDEO_SECS, type PlannedFrame } from "./lib/planner";
import { drawFrame, type DrawCtx, type RenderExtra } from "./lib/render";
import { assignCueAssets, preloadCueAssets, type PoolEntry, type StockAsset } from "./lib/broll";
import { previewSpeak } from "./lib/tts";
import { createSpeechT5Loader } from "./lib/tts-local";

const pack = loadPack("mstudio");
const theme: Theme = pack.themes[0]!;

const OUT_W = 720, OUT_H = 1280, OUT_BITRATE = 5_000_000, OUT_NAME = "clipflow-916.mp4";

const STARTER = [
  "/broll/1.jpg",
  "/broll/2.jpg",
  "/broll/3.jpg",
  "/broll/4.jpg",
  "/broll/5.jpg",
  "/broll/6.jpg",
  "/broll/7.jpg",
  "/broll/8.jpg",
  "/broll/9.jpg",
];

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

async function seekVideo(el: HTMLVideoElement, t: number): Promise<void> {
  try {
    const dur = el.duration;
    const target = Number.isFinite(dur) && dur > 0 ? t % dur : t;
    if (Math.abs(el.currentTime - target) < 0.05) return;
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
  const [broll, setBroll] = useState<ImageBitmap | null>(null);
  const [starterSrc, setStarterSrc] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [exportMsg, setExportMsg] = useState("");
  const [exportProgress, setExportProgress] = useState(0);
  const [autoMsg, setAutoMsg] = useState("");
  const [autoAssets, setAutoAssets] = useState<Array<StockAsset | null>>([]);
  const [voiceWarn, setVoiceWarn] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  const brollRef = useRef<ImageBitmap | null>(null);

  useEffect(() => {
    return () => {
      try {
        brollRef.current?.close();
      } catch {
        // close on unmount is best-effort; never throw.
      }
    };
  }, []);

  const profile = useMemo(() => ({ niche, audience, offer, tone, proof }), [niche, audience, offer, tone, proof]);
  const { script, err: scriptErr } = useMemo(() => {
    try {
      return { script: buildScript(idea, profile, pack), err: "" };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return { script: null, err: m.includes("E_EMPTY_IDEA") ? "E_EMPTY_IDEA: enter your idea above." : m };
    }
  }, [idea, profile]);

  useEffect(() => {
    setErr(scriptErr);
  }, [script]);

  const words = useMemo(() => (script ? planWords(script) : undefined), [script]);

  // Auto mode: on idea/profile/script change, auto assign + preload 1 stock
  // asset per cue (hook/beat1/beat2/beat3/cta). Debounced, no click needed.
  useEffect(() => {
    if (!script) {
      setAutoAssets([]);
      return;
    }
    let cancelled = false;
    setAutoMsg("Auto casting stock…");
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const cueTexts = script.cues.map((c) => c.text);
          const entries: PoolEntry[] = assignCueAssets(idea, profile, cueTexts);
          const loaded = await preloadCueAssets(entries);
          if (!cancelled) {
            setAutoAssets(loaded);
            const ok = loaded.filter(Boolean).length;
            setAutoMsg(ok === loaded.length ? `Auto stock ready (${ok}/5).` : `Auto stock ready (${ok}/5, rest gradient).`);
          }
        } catch {
          if (!cancelled) {
            setAutoAssets([]);
            setAutoMsg("");
          }
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [script, idea, profile]);

  function assetForCue(cue: { start: number; kind: string }): StockAsset | null {
    // Manual override wins: single user-picked b-roll covers every cue.
    if (broll) {
      return {
        kind: "image",
        src: starterSrc ?? "upload",
        el: broll,
        keywords: [],
      };
    }
    if (!script) return null;
    const idx = cueIndexOf(script, cue);
    return autoAssets[idx] ?? null;
  }

  async function onBrollFile(file: File | undefined) {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const prev = brollRef.current;
      brollRef.current = bmp;
      setBroll(bmp);
      setStarterSrc(null);
      if (prev) {
        try {
          prev.close();
        } catch {
          // close on closed bitmap throws; never propagate.
        }
      }
      setErr("");
    } catch {
      setErr("Could not load that image — try another file.");
    }
  }

  async function onStarterSelect(src: string) {
    try {
      const bmp = await createImageBitmap(await (await fetch(src)).blob());
      const prev = brollRef.current;
      brollRef.current = bmp;
      setBroll(bmp);
      setStarterSrc(src);
      if (prev) {
        try {
          prev.close();
        } catch {
          // close on closed bitmap throws; never propagate.
        }
      }
      setErr("");
    } catch {
      setErr("Could not load that image — try another file.");
    }
  }

  function onRemoveBroll() {
    const cur = brollRef.current;
    brollRef.current = null;
    setBroll(null);
    setStarterSrc(null);
    if (cur) {
      try {
        cur.close();
      } catch {
        // close is best-effort; never throw.
      }
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
      const frame = planFrames(script, 30)[0];
      if (!frame) return;
      const extra: RenderExtra = {};
      if (words) extra.words = words;
      const asset = assetForCue(frame.cue);
      if (asset) extra.asset = asset;
      drawFrame(ctx as DrawCtx, frame, theme, 360, 640, extra);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, words, broll, autoAssets]);

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
        // Assets: ensure 5 auto assets are loaded (script -> assets step).
        let cueAssets: Array<StockAsset | null> = autoAssets;
        if (cueAssets.length !== script.cues.length) {
          setExportMsg("Casting stock…");
          setExportProgress(25);
          const entries = assignCueAssets(idea, profile, script.cues.map((c) => c.text));
          cueAssets = await preloadCueAssets(entries);
          setAutoAssets(cueAssets);
        }
        setExportProgress(35);
        let pcm: Float32Array | null = null;
        if (voiceOn) {
          const loader = createSpeechT5Loader();
          const fullText = [script.hook, ...script.beats, script.cta].join(". ");
          setExportMsg("Rendering voice…");
          setExportProgress(50);
          try {
            const raw = await loader(fullText);
            const target = VIDEO_SECS * 16000;
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
        const frames: PlannedFrame[] = planFrames(script, 30);
        const assetByCue = new Map<number, StockAsset | null>();
        script.cues.forEach((c, i) => {
          if (broll) {
            assetByCue.set(i, { kind: "image", src: starterSrc ?? "upload", el: broll, keywords: [] });
          } else {
            assetByCue.set(i, cueAssets[i] ?? null);
          }
        });
        // Deterministic video start: seek each cue's video once before its frames.
        const sought = new Set<number>();
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
            if (asset?.kind === "video" && !sought.has(idx)) {
              sought.add(idx);
              await seekVideo(asset.el as HTMLVideoElement, 0.1);
            }
            const extra: RenderExtra = {};
            if (words) extra.words = words;
            if (asset) extra.asset = asset;
            drawFrame(ctx as DrawCtx, f, theme, OUT_W, OUT_H, extra);
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

  return (
    <main className="min-h-screen bg-[#080A0D] text-gray-100">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <h1 className="font-mono text-3xl uppercase tracking-widest">Clipflow</h1>
        <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-mono text-sm uppercase tracking-widest text-gray-300">Context</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block font-mono text-xs uppercase tracking-widest text-gray-400">
              Niche
              <input
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm normal-case tracking-normal text-gray-100 placeholder-gray-500 outline-none focus:border-[#246BFD]"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              />
            </label>
            <label className="block font-mono text-xs uppercase tracking-widest text-gray-400">
              Audience
              <input
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm normal-case tracking-normal text-gray-100 placeholder-gray-500 outline-none focus:border-[#246BFD]"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              />
            </label>
            <label className="block font-mono text-xs uppercase tracking-widest text-gray-400">
              Offer
              <input
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm normal-case tracking-normal text-gray-100 placeholder-gray-500 outline-none focus:border-[#246BFD]"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
              />
            </label>
            <label className="block font-mono text-xs uppercase tracking-widest text-gray-400">
              Tone
              <input
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm normal-case tracking-normal text-gray-100 placeholder-gray-500 outline-none focus:border-[#246BFD]"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
            </label>
            <label className="block font-mono text-xs uppercase tracking-widest text-gray-400">
              Proof
              <input
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm normal-case tracking-normal text-gray-100 placeholder-gray-500 outline-none focus:border-[#246BFD]"
                value={proof}
                onChange={(e) => setProof(e.target.value)}
              />
            </label>
          </div>
          <button
            className="rounded-full bg-[#246BFD] px-6 py-2 font-mono text-xs uppercase tracking-widest text-white hover:opacity-90 disabled:opacity-50"
            onClick={onSave}
          >
            Save
          </button>
          {saved ? <p className="text-sm text-gray-400">{saved}</p> : null}
        </section>
        <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-mono text-sm uppercase tracking-widest text-gray-300">Idea</h2>
          <input
            className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-gray-100 placeholder-gray-500 outline-none focus:border-[#246BFD]"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Your video idea"
          />
          {autoMsg ? <p className="text-sm text-gray-400">{autoMsg}</p> : null}
          {err ? (
            <p role="alert" className="text-sm text-red-400">
              {err}
            </p>
          ) : null}
        </section>
        {script ? (
          <>
            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="font-mono text-sm uppercase tracking-widest text-gray-300">Script</h2>
              <p className="text-gray-100">{script.hook}</p>
              {script.beats.map((b) => (
                <p key={b} className="text-gray-300">
                  {b}
                </p>
              ))}
              <p className="text-gray-100">{script.cta}</p>
            </section>
            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                width={360}
                height={640}
                className="aspect-[9/16] h-auto w-full max-w-xs rounded-xl border border-white/10 bg-black"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-full space-y-2">
                <p className="font-mono text-xs uppercase tracking-widest text-gray-400">Starter visuals (override auto stock)</p>
                <div className="flex flex-wrap gap-2">
                  {STARTER.map((src, i) => (
                    <button
                      key={src}
                      type="button"
                      title={`Unsplash starter photo ${i + 1}`}
                      onClick={() => void onStarterSelect(src)}
                      className={`overflow-hidden rounded-lg border ${
                        starterSrc === src ? "border-transparent ring-2 ring-[#246BFD]" : "border-white/15"
                      }`}
                    >
                      <img src={src} alt={`Starter visual ${i + 1}`} loading="lazy" className="h-16 w-10 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
              <label className="font-mono text-xs uppercase tracking-widest text-gray-400">
                B-roll
                <input
                  type="file"
                  accept="image/*"
                  className="mt-2 block text-sm normal-case tracking-normal text-gray-300"
                  onChange={(e) => void onBrollFile(e.target.files?.[0])}
                />
              </label>
              {broll ? (
                <button
                  className="rounded-full border border-white/15 px-6 py-2 font-mono text-xs uppercase tracking-widest text-gray-200 hover:opacity-90"
                  onClick={onRemoveBroll}
                >
                  Use auto stock
                </button>
              ) : null}
              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-gray-400">
                <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} />
                Voiceover + captions (first render downloads voice ~200MB, cached)
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full bg-[#246BFD] px-6 py-2 font-mono text-xs uppercase tracking-widest text-white hover:opacity-90 disabled:opacity-50"
                onClick={() => previewSpeak(script.hook)}
              >
                Preview voice
              </button>
              <button
                className="rounded-full bg-[#246BFD] px-6 py-2 font-mono text-xs uppercase tracking-widest text-white hover:opacity-90 disabled:opacity-50"
                onClick={onExport}
                disabled={status === "working"}
              >
                {status === "working" ? "Exporting…" : "Export clipflow-916.mp4"}
              </button>
            </div>
            {status === "working" ? (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#246BFD] transition-all" style={{ width: `${exportProgress}%` }} />
                </div>
                {exportMsg ? <p className="text-sm text-gray-300">{exportMsg}</p> : null}
              </div>
            ) : null}
            {exportMsg && status !== "working" ? <p className="text-sm text-gray-300">{exportMsg}</p> : null}
            {voiceWarn ? <p className="text-sm text-gray-300">{voiceWarn}</p> : null}
            {status === "exported" ? <p className="text-sm text-gray-300">Exported clipflow-916.mp4.</p> : null}
            <details className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-gray-400">
                TikTok caption
              </summary>
              <p className="mt-3 text-gray-300">{tiktok}</p>
              <button
                className="mt-3 rounded-full bg-[#246BFD] px-6 py-2 font-mono text-xs uppercase tracking-widest text-white hover:opacity-90"
                onClick={() => void copyText(tiktok)}
              >
                Copy
              </button>
            </details>
            <details className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-gray-400">
                X post
              </summary>
              <p className="mt-3 text-gray-300">{xpost}</p>
              <button
                className="mt-3 rounded-full bg-[#246BFD] px-6 py-2 font-mono text-xs uppercase tracking-widest text-white hover:opacity-90"
                onClick={() => void copyText(xpost)}
              >
                Copy
              </button>
            </details>
            <details className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-gray-400">
                LinkedIn
              </summary>
              <p className="mt-3 text-gray-300">{script.linkedin.body}</p>
              <button
                className="mt-3 rounded-full bg-[#246BFD] px-6 py-2 font-mono text-xs uppercase tracking-widest text-white hover:opacity-90"
                onClick={() => void copyText(script.linkedin.body)}
              >
                Copy
              </button>
            </details>
          </>
        ) : null}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-mono text-sm uppercase tracking-widest text-gray-300">Managed</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400">DIY Free</p>
              <p className="mt-3 text-gray-300">Free local-first tool, self-serve.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400">Managed €500 setup + €300/mo</p>
              <p className="mt-3 text-gray-300">Niche setup, video pipeline, posting calendar, monthly report.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400">Rev-share €500 + 20%</p>
              <p className="mt-3 text-gray-300">€500 + 20%, 90-day min.</p>
            </div>
          </div>
          <a
            href="mailto:hello@mstudioweb.pt?subject=Clipflow%20Managed"
            className="mt-4 inline-block rounded-full bg-[#246BFD] px-6 py-2 font-mono text-xs uppercase tracking-widest text-white hover:opacity-90"
          >
            Contact about Managed
          </a>
        </section>
      </div>
    </main>
  );
}
