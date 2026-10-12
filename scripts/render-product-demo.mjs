/**
 * Render the Clipflow product demo with the product-demo FX pack.
 *
 * Boards-driven product demo: 4 board cells (idea/script/visuals/export)
 * + karaoke ASS captions + pinned CTA endcap + per-cue Kokoro voiceover
 * (af_heart, each cue spoken inside its own caption window).
 *
 * Usage: node scripts/render-product-demo.mjs [--silent]
 *   --silent skips the voiceover (silent demo).
 * Output: outputs/product-demo/clipflow-demo.mp4 (720x1280, 24s)
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";

const requirePackage = createRequire(import.meta.url);
const { buildSync } = requirePackage("esbuild");

const SILENT = process.argv.includes("--silent");

const root = process.cwd();
const tmp = path.join(root, ".fx-tmp");
mkdirSync(tmp, { recursive: true });
const outDir = path.join(root, "outputs", "product-demo");
mkdirSync(outDir, { recursive: true });

const stagedFont = path.join(tmp, "arialbd.ttf");
if (!existsSync(stagedFont)) copyFileSync("C:/Windows/Fonts/arialbd.ttf", stagedFont);
const FONT = path.relative(root, stagedFont).replace(/\\/g, "/");

const bundle = path.join(root, "scripts", ".fx-demo-entry.bundled.mjs");
buildSync({
  entryPoints: [path.join(root, "scripts", "product-demo-entry.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["ffmpeg-static"],
  outfile: bundle,
  logLevel: "warning",
});

let code = 1;
try {
  const mod = await import(pathToFileURL(bundle).href);
  const { DEMO, FilterGraph, checkFilters, composeDemo } = mod;

  const probe = composeDemo(FONT);
  const missing = checkFilters(ffmpegPath, probe.requires);
  if (missing.length > 0) console.log(`[product-demo] missing filters ${missing.join(",")} — recomposing`);

  const graph = new FilterGraph();
  const segLabels = DEMO.segments.map((seg, i) =>
    graph.chain(`[${i}:v]`, [
      seg.kind === "image"
        ? `trim=start=0:end=${seg.dur},setpts=PTS-STARTPTS,fps=${DEMO.fps},scale=${DEMO.W}:${DEMO.H},setsar=1`
        : `trim=start=0:end=${seg.dur},setpts=PTS-STARTPTS,fps=${DEMO.fps},scale=${DEMO.W}:${DEMO.H},setsar=1`,
    ]),
  );
  const vcat = graph.chain(segLabels.map((l) => `[${l}]`).join(""), [`concat=n=${segLabels.length}:v=1:a=0`]);
  const composed = composeDemo(FONT, missing, graph, `[${vcat}]`);

  // Boards carry their own UI — no generic mockup overlays. Logo bug only.
  const MOCKUPS = [];
  // Logo bug: real brand/mark.png top-left for the whole body (0-20.8s),
  // then the pinned CTA endcap covers it with a large centered mark.
  const LOGO_END = 20.8;
  const logoIdx = DEMO.segments.length + MOCKUPS.length;
  const logoPrep = graph.chain(`[${logoIdx}:v]`, [
    `format=rgba,scale=84:-1`,
  ]);
  let tail = graph.chain(`[${composed.outLabel}][${logoPrep}]`, [
    `overlay=W-w-36:190:enable='between(t,0,${LOGO_END})'`,
  ]);
  MOCKUPS.forEach((m, k) => {
    const idx = DEMO.segments.length + k;
    const prep = graph.chain(`[${idx}:v]`, [
      `format=rgba,scale=600:-2,fade=t=in:st=${m.start}:d=0.4:alpha=1,fade=t=out:st=${m.end - 0.4}:d=0.4:alpha=1`,
    ]);
    tail = graph.chain(`[${tail}][${prep}]`, [
      `overlay=(W-w)/2:H*0.40-h/2:enable='between(t,${m.start},${m.end})'`,
    ]);
  });
  // Centered mark on the endcap (fades in with the CTA text).
  const endPrep = graph.chain(`[${logoIdx}:v]`, [
    `format=rgba,scale=220:-1,fade=t=in:st=${LOGO_END}:d=0.3:alpha=1`,
  ]);
  tail = graph.chain(`[${tail}][${endPrep}]`, [
    `overlay=(W-w)/2:H*0.22-h/2:enable='gte(t,${LOGO_END})'`,
  ]);

  if (composed.ass) {
    const assDisk = path.join(tmp, "product-demo.ass");
    writeFileSync(assDisk, composed.ass);
    const assFilter = assDisk.replace(/\\/g, "/").replace(/'/g, "\\'").replace(/:/g, "\\:");
    tail = graph.chain(`[${tail}]`, [`ass='${assFilter}'`]);
  }
  const vout = graph.chain(`[${tail}]`, ["format=yuv420p"]);
  const errors = graph.validate(DEMO.segments.length + MOCKUPS.length + 1);
  if (errors.length > 0) {
    console.error(`[product-demo] invalid graph:\n${errors.join("\n")}`);
    process.exit(2);
  }
  const filterFile = path.join(tmp, "product-demo.txt").replace(/\\/g, "/");
  writeFileSync(filterFile, graph.script());

  const out = path.join(outDir, "clipflow-demo.mp4");
  const silentOut = path.join(tmp, "clipflow-demo-silent.mp4");
  const fargs = ["-y"];
  for (const seg of DEMO.segments) {
    if (seg.kind === "image") fargs.push("-loop", "1", "-framerate", String(DEMO.fps), "-i", path.join(root, seg.src));
    else fargs.push("-i", path.join(root, seg.src));
  }
  for (const m of MOCKUPS) fargs.push("-loop", "1", "-framerate", String(DEMO.fps), "-i", path.join(root, "outputs", "mockups", m.file));
  fargs.push("-loop", "1", "-framerate", String(DEMO.fps), "-i", path.join(root, "public", "brand", "mark.png"));
  fargs.push(
    "-filter_complex_script", filterFile,
    "-map", `[${vout}]`,
    "-t", String(DEMO.duration),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-pix_fmt", "yuv420p", silentOut,
  );
  const res = spawnSync(ffmpegPath, fargs, { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(`[product-demo] ffmpeg failed\nCMD: ${[ffmpegPath, ...fargs].join(" ")}\n${(res.stderr ?? "").slice(-2000)}`);
    process.exit(1);
  }

  if (SILENT) {
    const copy = spawnSync(ffmpegPath, ["-y", "-i", silentOut, "-c:v", "copy", "-movflags", "+faststart", out], { stdio: "inherit" });
    if (copy.status !== 0) process.exit(copy.status ?? 1);
    console.log(`[product-demo] wrote ${path.relative(root, out)} (silent) placed=[${composed.placed.map((p) => `${p.defId}@${p.start.toFixed(1)}s`).join(", ")}]`);
    code = 0;
  } else {

  // Per-cue Kokoro voiceover (af_heart): each cue spoken inside its own
  // caption window so the 24s demo actually talks. Mirrors
  // scripts/render-landing-hero.mjs: peak-normalized 16-bit PCM WAV per cue,
  // adelay-placed, amix-ed, padded to the full duration.
  console.log(`[product-demo] synthesizing per-cue voiceover (${DEMO.assCues.length} cues, af_heart)…`);
  const { env } = requirePackage("@huggingface/transformers");
  const { KokoroTTS } = requirePackage("kokoro-js");
  env.localModelPath = path.join(root, "public", "models");
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  const mixBundle = path.join(tmp, "audio-mix.bundled.mjs");
  buildSync({ entryPoints: [path.join(root, "shared", "audio-mix.ts")], bundle: true, platform: "node", format: "esm", outfile: mixBundle });
  const mix = await import(pathToFileURL(mixBundle).href);
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
  function encodeWav(pcm, sampleRate) {
    const peak = pcm.reduce((largest, sample) => Math.max(largest, Math.abs(sample)), 0);
    const gain = mix.peakGain(peak);
    const wavBytes = pcm.length * 2;
    const wav = Buffer.alloc(44 + wavBytes);
    wav.write("RIFF", 0); wav.writeUInt32LE(36 + wavBytes, 4); wav.write("WAVE", 8);
    wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write("data", 36); wav.writeUInt32LE(wavBytes, 40);
    for (let i = 0; i < pcm.length; i++) {
      const sample = Math.max(-1, Math.min(1, pcm[i] * gain));
      wav.writeInt16LE(Math.round(sample * (sample < 0 ? 32768 : 32767)), 44 + i * 2);
    }
    return wav;
  }
  const voiceInputs = [];
  const voiceFilters = [];
  for (let ci = 0; ci < DEMO.assCues.length; ci++) {
    const cue = DEMO.assCues[ci];
    const window = cue.end - cue.start;
    const spoken = await tts.generate(cue.text, { voice: mix.VOICE.kokoroVoice });
    const secs = spoken.audio.length / spoken.sampling_rate;
    // Squeeze an overrunning cue into its window (atempo>1 speeds up); leave
    // headroom otherwise so cues breathe instead of back-to-back talking.
    const { tempo } = mix.cueFit(secs, window);
    console.log(`[product-demo] cue ${ci}: voice ${secs.toFixed(1)}s in ${window.toFixed(1)}s window${tempo > 1 ? `, tempo ${tempo.toFixed(2)}` : ""}`);
    const voicePath = path.join(tmp, `demo-voice-${ci}.wav`).replace(/\\/g, "/");
    writeFileSync(voicePath, encodeWav(spoken.audio, spoken.sampling_rate));
    voiceInputs.push("-i", voicePath);
    voiceFilters.push(mix.voicePlacement(ci + 1, cue.start, tempo, `a${ci}`));
  }
  const muxFilter = `${voiceFilters.join(";")};${mix.voiceMixTail(DEMO.assCues.length, DEMO.duration)}`;
  const mux = spawnSync(ffmpegPath, ["-y", "-i", silentOut, ...voiceInputs, "-filter_complex", muxFilter, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-t", String(DEMO.duration), "-movflags", "+faststart", out], { stdio: "inherit" });
  if (mux.status !== 0) process.exit(mux.status ?? 1);
  console.log(`[product-demo] wrote ${path.relative(root, out)} with voiceover placed=[${composed.placed.map((p) => `${p.defId}@${p.start.toFixed(1)}s`).join(", ")}]`);
  code = 0;
  }
} finally {
  try {
    unlinkSync(bundle);
  } catch {
    // ignore
  }
}
process.exit(code);
