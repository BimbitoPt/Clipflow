import { useEffect, useMemo, useRef, useState } from "react";
import { loadPack, type Theme } from "./lib/packs";
import { MSTUDIO_PROFILE, loadProfile, saveProfile } from "./lib/profile";
import { buildScript } from "./lib/script";
import { planFrames, planWords, type PlannedFrame } from "./lib/planner";
import { drawFrame, type BrollImage, type DrawCtx, type RenderExtra } from "./lib/render";
import { previewSpeak } from "./lib/tts";
import { createSpeechT5Loader } from "./lib/tts-local";

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
  const [voiceOn, setVoiceOn] = useState(true);
  const [exportMsg, setExportMsg] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);

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

  async function onBrollFile(file: File | undefined) {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      setBroll(bmp);
      setErr("");
    } catch {
      setErr("Could not load that image — try another file.");
    }
  }

  function onRemoveBroll() {
    try {
      broll?.close();
    } catch {
      // close is best-effort; never throw.
    }
    setBroll(null);
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
      if (broll) extra.image = broll as unknown as BrollImage;
      drawFrame(ctx as DrawCtx, frame, theme, 360, 640, extra);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [script, words, broll]);

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
      setExportMsg("");
      try {
        let pcm: Float32Array | null = null;
        if (voiceOn) {
          const loader = createSpeechT5Loader();
          const fullText = [script.hook, ...script.beats, script.cta].join(". ");
          setExportMsg("Rendering voice…");
          try {
            pcm = await loader(fullText);
          } catch (e) {
            setStatus("error");
            setErr(e instanceof Error ? e.message : String(e));
            return;
          } finally {
            setExportMsg("");
          }
        }
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
        const extra: RenderExtra = {};
        if (words) extra.words = words;
        if (broll) extra.image = broll as unknown as BrollImage;
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
          for (const f of frames) {
            drawFrame(ctx as DrawCtx, f, theme, OUT_W, OUT_H, extra);
            const vf = new VideoFrame(canvas, { timestamp: Math.round(f.t * 1e6) });
            try {
              encoder.encode(vf, { keyFrame: f.t < 1 });
            } finally {
              vf.close();
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
                  Remove
                </button>
              ) : null}
              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-gray-400">
                <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} />
                Voiceover (first render downloads voice ~200MB, cached)
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
                {status === "working" ? "Exporting…" : "Export"}
              </button>
            </div>
            {exportMsg ? <p className="text-sm text-gray-300">{exportMsg}</p> : null}
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
      </div>
    </main>
  );
}
