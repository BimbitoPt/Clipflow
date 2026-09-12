import { useEffect, useMemo, useRef, useState } from "react";
import { loadPack, type Theme } from "./lib/packs";
import { MSTUDIO_PROFILE, loadProfile, saveProfile } from "./lib/profile";
import { buildScript } from "./lib/script";
import { planFrames, type PlannedFrame } from "./lib/planner";
import { drawFrame, type DrawCtx } from "./lib/render";
import { previewSpeak } from "./lib/tts";

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
      drawFrame(ctx as DrawCtx, frame, theme, 360, 640);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [script]);

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
      setStatus("working");
      setErr("");
      try {
        const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
        const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width: OUT_W, height: OUT_H }, fastStart: "in-memory" });
        const canvas = document.createElement("canvas");
        canvas.width = OUT_W;
        canvas.height = OUT_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("E_CANVAS: 2d context unavailable");
        const frames: PlannedFrame[] = planFrames(script, 30);
        let encErr: unknown = null;
        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => {
            encErr = e;
          },
        });
        encoder.configure({ codec: "avc1.42001f", width: OUT_W, height: OUT_H, bitrate: OUT_BITRATE });
        try {
          for (const f of frames) {
            drawFrame(ctx as DrawCtx, f, theme, OUT_W, OUT_H);
            const vf = new VideoFrame(canvas, { timestamp: Math.round(f.t * 1e6) });
            try {
              encoder.encode(vf, { keyFrame: f.t < 1 });
            } finally {
              vf.close();
            }
          }
          await encoder.flush();
          if (encErr) throw encErr;
          muxer.finalize();
        } finally {
          if (encoder.state !== "closed") encoder.close();
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
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>Clipflow</h1>
      <section>
        <h2>Context</h2>
        <label>Niche<input value={niche} onChange={(e) => setNiche(e.target.value)} /></label>
        <label>Audience<input value={audience} onChange={(e) => setAudience(e.target.value)} /></label>
        <label>Offer<input value={offer} onChange={(e) => setOffer(e.target.value)} /></label>
        <label>Tone<input value={tone} onChange={(e) => setTone(e.target.value)} /></label>
        <label>Proof<input value={proof} onChange={(e) => setProof(e.target.value)} /></label>
        <button onClick={onSave}>Save</button>
        {saved ? <p>{saved}</p> : null}
      </section>
      <section>
        <h2>Idea</h2>
        <input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Your video idea" />
        {err ? <p role="alert">{err}</p> : null}
      </section>
      {script ? (
        <>
          <section>
            <h2>Script</h2>
            <p>{script.hook}</p>
            {script.beats.map((b) => (
              <p key={b}>{b}</p>
            ))}
            <p>{script.cta}</p>
          </section>
          <canvas ref={canvasRef} width={360} height={640} />
          <div>
            <button onClick={() => previewSpeak(script.hook)}>Preview voice</button>
            <button onClick={onExport} disabled={status === "working"}>
              {status === "working" ? "Exporting…" : "Export"}
            </button>
          </div>
          {status === "exported" ? <p>Exported clipflow-916.mp4.</p> : null}
          <details>
            <summary>TikTok caption</summary>
            <p>{tiktok}</p>
            <button onClick={() => void copyText(tiktok)}>Copy</button>
          </details>
          <details>
            <summary>X post</summary>
            <p>{xpost}</p>
            <button onClick={() => void copyText(xpost)}>Copy</button>
          </details>
          <details>
            <summary>LinkedIn</summary>
            <p>{script.linkedin.body}</p>
            <button onClick={() => void copyText(script.linkedin.body)}>Copy</button>
          </details>
        </>
      ) : null}
    </main>
  );
}
