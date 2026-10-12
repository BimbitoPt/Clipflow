#!/usr/bin/env node
/**
 * Clipflow video CLI — agent-readable render verification (inspired by fframes).
 *
 *   node scripts/video.mjs timeline                     cues, frames, variants, captions
 *   node scripts/video.mjs inspect [RANGE] [--every 0.25s] [--fail-on warning] [--json]
 *   node scripts/video.mjs strip [RANGE] -n 12 [--columns 4]     contact sheet PNG
 *   node scripts/video.mjs frame <times...>                      full-size PNGs
 *   node scripts/video.mjs onion <RANGE> -n 6                    blended movement PNG
 *   node scripts/video.mjs bench [--frames 300] [--parity]       drawFrame ms/frame
 *   node scripts/video.mjs audio analyze [file] [--synth] [--waveform] [--json]
 *
 * Times:   120 (frame), 3.2s, 50%, start, end, cue names (hook, beat1..beat3, cta),
 *          inside a cue hook@50% / hook@1.2s / hook@end, ranges a..b or a bare cue.
 * Options: --pack mstudio|clipflow  --idea "..."  --asset auto|none
 *          --captions auto|scene|speech|off  --voice  --effect NAME  --no-cache
 *          --port 8099  --json
 *
 * Exit codes: 0 ok, 1 usage/environment error, 2 inspect findings (errors, or
 * warnings with --fail-on warning). Outputs land in outputs/inspect/.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ffmpegPath from "ffmpeg-static";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "outputs", "inspect");
const DEFAULT_PORT = 8099;

// ---------------------------------------------------------------- arg parsing

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-n" || a === "-o") {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith("-") && !/^-\d/.test(next))) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
      continue;
    }
    positional.push(a);
  }
  return { positional, flags };
}

const USAGE = `clipflow video CLI — see header of scripts/video.mjs for commands`;

function die(msg, code = 1) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

function log(...parts) {
  process.stderr.write(parts.join(" ") + "\n");
}

function harnessOpts(flags) {
  const o = {};
  if (typeof flags.pack === "string") o.pack = flags.pack;
  if (typeof flags.idea === "string") o.idea = flags.idea;
  if (flags.asset === "auto" || flags.asset === "none") o.asset = flags.asset;
  if (typeof flags.captions === "string") o.captions = flags.captions;
  if (flags.voice) o.voiceOn = flags.voice !== "false" && flags.voice !== "0";
  if (typeof flags.effect === "string") o.visualEffect = flags.effect;
  if (flags["no-cache"]) o.cache = false;
  if (typeof flags.fault === "string") o.fault = flags.fault;
  return o;
}

function wantJson(flags) {
  return flags.json === true || flags.json === "true";
}

function ensureOutDir() {
  mkdirSync(OUT, { recursive: true });
  return OUT;
}

function saveDataUrl(dataUrl, file) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  writeFileSync(file, Buffer.from(b64, "base64"));
  return file;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

// ------------------------------------------------------------- dev server

async function ping(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer(port) {
  const url = `http://localhost:${port}/inspect.html`;
  if (await ping(url)) return { url, child: null };
  const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) die("E_NO_VITE: node_modules missing — run npm install first");
  log(`[video] starting vite dev server on :${port}…`);
  const child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, VITE_LOG_LEVEL: "warn" },
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d; });
  child.stderr.on("data", (d) => { bootLog += d; });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await ping(url)) return { url, child };
    if (await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), 200))])) {
      die(`E_VITE_EXIT: dev server failed to start\n${bootLog.slice(-2000)}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  die("E_VITE_TIMEOUT: dev server did not answer in 45s");
}

// ---------------------------------------------------------------- session

async function openSession(flags) {
  const port = Number(flags.port) > 0 ? Number(flags.port) : DEFAULT_PORT;
  const server = await ensureServer(port);
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch (e) {
    die(`E_NO_PLAYWRIGHT: ${e.message} — run: npm install`);
  }
  let browser;
  try {
    browser = await chromium.launch(
      process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
    );
  } catch (e) {
    die(`E_NO_BROWSER: chromium unavailable — run: npx playwright install chromium\n${e.message}`);
  }
  const page = await browser.newPage();
  page.on("pageerror", (err) => log("[video] harness page error:", err.message));
  try {
    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForFunction(() => typeof window.__cf === "object", null, { timeout: 15_000 });
  } catch (e) {
    await browser.close();
    if (server.child) server.child.kill();
    die(`E_HARNESS: could not load harness at ${server.url}\n${e.message}`);
  }
  return {
    page,
    close: async () => {
      await browser.close();
      if (server.child) {
        server.child.kill();
        await new Promise((r) => setTimeout(r, 150));
      }
    },
  };
}

function call(page, method, args = []) {
  return page.evaluate(([m, a]) => window.__cf[m](...a), [method, args]);
}

function harnessError(e) {
  const m = /E_[A-Z_]+[^\n]*/.exec(String(e && e.message ? e.message : e));
  return m ? m[0] : String(e && e.message ? e.message : e);
}

// ---------------------------------------------------------------- commands

async function cmdTimeline(session, opts, flags) {
  const tl = await call(session.page, "timeline", [opts]);
  if (wantJson(flags)) {
    process.stdout.write(JSON.stringify(tl, null, 2) + "\n");
    return 0;
  }
  const lines = [];
  lines.push(
    `clipflow ${tl.width}x${tl.height} @${tl.fps}fps — ${tl.totalSecs.toFixed(2)}s ` +
      `(${Math.round(tl.totalSecs * tl.fps)} frames) pack=${tl.pack} theme=${tl.theme.accent}`,
  );
  lines.push(`captions=${tl.captionMode} (${tl.captionPhrases} phrases) words=${tl.words} asset=${tl.assetMode}`);
  lines.push("");
  lines.push(" cue     start     end   frames   variant  text");
  for (const cue of tl.cues) {
    const text = cue.text.length > 52 ? cue.text.slice(0, 51) + "…" : cue.text;
    lines.push(
      ` ${cue.name.padEnd(7)} ${cue.start.toFixed(2).padStart(6)}  ${cue.end.toFixed(2).padStart(6)}  ` +
        `${String(cue.frameStart).padStart(4)}-${String(cue.frameEnd).padStart(4)}  ${cue.variant.padEnd(7)}  ${text}`,
    );
  }
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

async function cmdInspect(session, opts, positional, flags) {
  const rangeSpec = positional[0];
  const every = typeof flags.every === "string" ? flags.every : "0.25s";
  const step = /^\d+(?:\.\d+)?ms$/.test(every)
    ? Number(every.replace("ms", "")) / 1000
    : Number(every.replace(/s$/, ""));
  if (!Number.isFinite(step) || step <= 0) die(`E_BAD_EVERY: ${every}`);
  const [from, to] = await call(session.page, "parseRangeBounds", [rangeSpec, opts]);
  const times = [];
  for (let t = from; t < to; t += step) times.push(t);
  if (times.length === 0) times.push(from);
  const { issues, sampled } = await call(session.page, "inspect", [times, opts]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const report = {
    sampled,
    every: step,
    range: [from, to],
    errors: errors.length,
    warnings: warnings.length,
    issues,
  };
  ensureOutDir();
  writeFileSync(path.join(OUT, "inspect.json"), JSON.stringify(report, null, 2));
  if (wantJson(flags)) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    for (const issue of issues) {
      process.stdout.write(
        `${issue.code.padEnd(15)} t=${issue.t.toFixed(2)}s (${issue.cue})  ${issue.message}\n`,
      );
    }
    process.stdout.write(
      `${sampled} frames sampled every ${step}s → ${errors.length} errors, ${warnings.length} warnings ` +
        `(report: ${rel(path.join(OUT, "inspect.json"))})\n`,
    );
  }
  if (errors.length > 0) return 2;
  if (warnings.length > 0 && (flags["fail-on"] === "warning" || flags["fail-on"] === "warnings")) return 2;
  return 0;
}

async function cmdStrip(session, opts, positional, flags) {
  const n = Number(flags.n) > 0 ? Number(flags.n) : 12;
  const columns = Number(flags.columns) > 0 ? Number(flags.columns) : 4;
  const width = Number(flags.width) > 0 ? Number(flags.width) : 200;
  const times = await call(session.page, "parseRangeTimes", [positional[0], n, opts]);
  const { png, cells } = await call(session.page, "strip", [times, opts, columns, width]);
  ensureOutDir();
  const out = typeof flags.o === "string" ? path.resolve(flags.o) : path.join(OUT, "strip.png");
  saveDataUrl(png, out);
  if (wantJson(flags)) {
    process.stdout.write(JSON.stringify({ out: rel(out), cells }, null, 2) + "\n");
  } else {
    process.stdout.write(`${rel(out)} — ${cells.length} cells (${cells.map((c) => `${c.cue}@${c.t.toFixed(2)}s`).join(" ")})\n`);
  }
  return 0;
}

async function cmdFrame(session, opts, positional, flags) {
  if (positional.length === 0) die("E_USAGE: frame needs at least one time (e.g. frame hook@50% 12s 30%)");
  const times = await call(session.page, "parseTimes", [positional, opts]);
  const results = await call(session.page, "frames", [times, opts, true]);
  const dir = typeof flags.o === "string" ? path.resolve(flags.o) : path.join(OUT, "frames");
  mkdirSync(dir, { recursive: true });
  const files = [];
  let findings = 0;
  for (const r of results) {
    const name = `${r.cue}-${r.t.toFixed(2)}s.png`;
    const file = path.join(dir, name);
    saveDataUrl(r.png, file);
    files.push(rel(file));
    for (const issue of r.issues) {
      findings++;
      process.stdout.write(`${issue.code.padEnd(15)} t=${issue.t.toFixed(2)}s (${issue.cue})  ${issue.message}\n`);
    }
  }
  if (wantJson(flags)) {
    process.stdout.write(JSON.stringify({ files, findings }, null, 2) + "\n");
  } else {
    process.stdout.write(`${files.length} frames → ${rel(dir)} (${findings} findings)\n`);
    for (const f of files) process.stdout.write(`  ${f}\n`);
  }
  return findings > 0 && errorsIn(results) ? 2 : 0;
}

function errorsIn(results) {
  return results.some((r) => r.issues.some((i) => i.level === "error"));
}

async function cmdOnion(session, opts, positional, flags) {
  const n = Number(flags.n) > 0 ? Number(flags.n) : 6;
  const times = await call(session.page, "parseRangeTimes", [positional[0], n, opts]);
  const { png } = await call(session.page, "onion", [times, opts]);
  ensureOutDir();
  const out = typeof flags.o === "string" ? path.resolve(flags.o) : path.join(OUT, "onion.png");
  saveDataUrl(png, out);
  if (wantJson(flags)) {
    process.stdout.write(JSON.stringify({ out: rel(out), times }, null, 2) + "\n");
  } else {
    process.stdout.write(`${rel(out)} — blended ${times.map((t) => t.toFixed(2) + "s").join(", ")}\n`);
  }
  return 0;
}

async function cmdBench(session, opts, flags) {
  const frames = Number(flags.frames) > 0 ? Number(flags.frames) : 300;
  const parity = flags.parity === true;
  const stats = await call(session.page, "bench", [frames, opts, parity]);
  if (wantJson(flags)) {
    process.stdout.write(JSON.stringify(stats, null, 2) + "\n");
  } else if (parity && stats.parity) {
    const c = stats.cache;
    const u = stats.noCache;
    const p = stats.parity;
    process.stdout.write(
      `cache    ${c.frames} frames  avg ${c.avgMs}ms  p50 ${c.p50Ms}ms  p95 ${c.p95Ms}ms  total ${c.totalMs}ms\n` +
        `no-cache ${u.frames} frames  avg ${u.avgMs}ms  p50 ${u.p50Ms}ms  p95 ${u.p95Ms}ms  total ${u.totalMs}ms\n` +
        `parity   ${p.compared} compared, ${p.mismatched} mismatched` +
        (p.videoChecked ? ` (${p.videoChecked} video frames state-checked)` : "") +
        (p.runs?.length ? `  runs: ${p.runs.map((r) => (r.from === r.to ? `#${r.from}` : `#${r.from}-${r.to}`)).join(" ")}` : "") + "\n" +
        (p.firstMismatch >= 0
          ? `first    frame #${p.firstMismatch} at t=${p.atT}s phrase=${p.phrase ? `${p.phrase.kind} "${p.phrase.text}"` : "none"} hash ${p.sample.cached} vs ${p.sample.uncached}\n` +
            (p.probe ? `probe    ${p.probe.changedSamples}/${p.probe.totalSamples} samples differ, maxDelta=${p.probe.maxDelta}\n` : "")
          : ""),
    );
  } else {
    process.stdout.write(
      `${stats.frames} frames  avg ${stats.avgMs}ms  p50 ${stats.p50Ms}ms  p95 ${stats.p95Ms}ms  total ${stats.totalMs}ms\n`,
    );
  }
  return 0;
}

// ---------------------------------------------------------------- audio

function newestMedia() {
  const dirs = [path.join(ROOT, "exports"), path.join(ROOT, "outputs")];
  const exts = new Set([".mp4", ".mkv", ".mov", ".wav", ".m4a", ".webm"]);
  let best = null;
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!exts.has(path.extname(name).toLowerCase())) continue;
      const file = path.join(dir, name);
      try {
        const st = statSync(file);
        if (!best || st.mtimeMs > best.mtimeMs) best = { file, mtimeMs: st.mtimeMs };
      } catch {
        // ignore unreadable entries
      }
    }
  }
  return best ? best.file : null;
}

function ffmpeg(args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    execFile(
      ffmpegPath,
      ["-hide_banner", "-nostats", ...args],
      { maxBuffer, encoding: "utf8" },
      (error, stdout, stderr) => resolve({ error, stdout: stdout ?? "", stderr: stderr ?? "" }),
    );
  });
}

function encodeWav(pcm, sampleRate, gainFn) {
  const peak = pcm.reduce((largest, sample) => Math.max(largest, Math.abs(sample)), 0);
  const gain = gainFn(peak);
  const wavBytes = pcm.length * 2;
  const wav = Buffer.alloc(44 + wavBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + wavBytes, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wavBytes, 40);
  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i] * gain));
    wav.writeInt16LE(Math.round(sample * (sample < 0 ? 32768 : 32767)), 44 + i * 2);
  }
  return wav;
}

let audioMixPromise = null;
function loadAudioMix() {
  if (!audioMixPromise) {
    audioMixPromise = (async () => {
      const requirePkg = createRequire(import.meta.url);
      const { buildSync } = requirePkg("esbuild");
      const dir = path.join(ROOT, ".fx-tmp");
      mkdirSync(dir, { recursive: true });
      const outfile = path.join(dir, "audio-mix.bundled.mjs");
      buildSync({
        entryPoints: [path.join(ROOT, "shared", "audio-mix.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile,
      });
      return import(pathToFileURL(outfile).href);
    })();
  }
  return audioMixPromise;
}

async function synthVoice(opts, flags) {
  const modelsDir = path.join(ROOT, "public", "models");
  if (!existsSync(path.join(modelsDir, "onnx-community"))) {
    die("E_NO_MODEL: public/models is missing Kokoro — run: npm run model:install");
  }
  const require = createRequire(import.meta.url);
  let KokoroTTS;
  let env;
  try {
    ({ KokoroTTS } = require("kokoro-js"));
    ({ env } = require("@huggingface/transformers"));
  } catch (e) {
    die(`E_NO_KOKORO: ${e.message}`);
  }
  env.localModelPath = modelsDir;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  log("[audio] synthesizing per-cue Kokoro voiceover (af_heart)…");
  const session = await openSession(flags);
  let cues;
  let total;
  try {
    const tl = await call(session.page, "timeline", [opts]);
    cues = tl.cues;
    total = tl.totalSecs;
  } finally {
    await session.close();
  }
  const mix = await loadAudioMix();
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8",
    device: "cpu",
  });
  const voiceInputs = [];
  const mixFilters = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const window = cue.end - cue.start;
    const spoken = await tts.generate(cue.text, { voice: mix.VOICE.kokoroVoice });
    const secs = spoken.audio.length / spoken.sampling_rate;
    const { tempo } = mix.cueFit(secs, window);
    const file = path.join(OUT, `vo-${i}.wav`);
    writeFileSync(file, encodeWav(spoken.audio, spoken.sampling_rate, mix.peakGain));
    voiceInputs.push("-i", file);
    mixFilters.push(mix.voicePlacement(i, cue.start, tempo, `a${i}`));
    log(`[audio] ${cue.name}: ${secs.toFixed(1)}s voice in ${window.toFixed(1)}s window (tempo ${tempo.toFixed(2)})`);
  }
  const out = path.join(OUT, "vo.wav");
  const filter = `${mixFilters.join(";")};${mix.voiceMixTail(cues.length, total)}`;
  const res = await ffmpeg(["-y", ...voiceInputs, "-filter_complex", filter, "-map", "[a]", "-c:a", "pcm_s16le", out]);
  if (res.error) die(`E_SYNTH_FFMPEG: ${res.stderr.slice(-1500)}`);
  log(`[audio] wrote ${rel(out)}`);
  return out;
}

function parseLoudness(stderr) {
  const out = {
    integratedLufs: null,
    thresholdLufs: null,
    lraLu: null,
    truePeakDbfs: null,
    peakDbfs: null,
    rmsDbfs: null,
    clippedSamples: null,
    silences: [],
  };
  const integrated = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+)\s*LUFS\s*\n\s*Threshold:\s*(-?[\d.]+)\s*LUFS/.exec(stderr);
  if (integrated) {
    out.integratedLufs = Number(integrated[1]);
    out.thresholdLufs = Number(integrated[2]);
  }
  const lra = /Loudness range:\s*\n\s*LRA:\s*(-?[\d.]+)\s*LU/.exec(stderr);
  if (lra) out.lraLu = Number(lra[1]);
  const peak = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+)\s*dBFS/.exec(stderr);
  if (peak) out.truePeakDbfs = Number(peak[1]);
  const clipped = [...stderr.matchAll(/Number of clipped samples:\s*(\d+)/g)];
  if (clipped.length > 0) out.clippedSamples = Number(clipped[clipped.length - 1][1]);
  const peaks = [...stderr.matchAll(/Peak level dB:\s*(-?[\d.]+)/g)];
  if (peaks.length > 0) out.peakDbfs = Number(peaks[peaks.length - 1][1]);
  const rms = [...stderr.matchAll(/RMS level dB:\s*(-?[\d.]+)/g)];
  if (rms.length > 0) out.rmsDbfs = Number(rms[rms.length - 1][1]);
  let open = null;
  for (const line of stderr.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) { open = Number(s[1]); continue; }
    const e = /silence_end:\s*(-?[\d.]+)\s*\|\s*silence_duration:\s*(-?[\d.]+)/.exec(line);
    if (e && open !== null) {
      out.silences.push({ start: open, end: Number(e[1]), duration: Number(e[2]) });
      open = null;
    }
  }
  // Some ffmpeg builds omit "Number of clipped samples"; derive clipping from
  // the Overall block's min/max sample level (|level| >= 1.0 == clipped).
  const overallIdx = stderr.lastIndexOf("Overall");
  if (overallIdx >= 0) {
    const tail = stderr.slice(overallIdx);
    const minL = /Min level:\s*(-?[\d.]+)/.exec(tail);
    const maxL = /Max level:\s*(-?[\d.]+)/.exec(tail);
    if (minL && maxL) {
      out.samplePeak = Math.max(Math.abs(Number(minL[1])), Math.abs(Number(maxL[1])));
    }
  }
  if (out.clippedSamples === null) {
    out.clipping = out.samplePeak !== undefined && out.samplePeak >= 0.999;
  } else {
    out.clipping = out.clippedSamples > 0;
  }
  return out;
}

async function cmdAudio(sessionlessFlags, opts, positional) {
  const sub = positional[0];
  if (sub !== "analyze") die("E_USAGE: audio analyze [file] [--synth] [--waveform]");
  const flags = sessionlessFlags;
  let file = typeof positional[1] === "string" && !positional[1].startsWith("-") ? positional[1] : null;
  let synth = false;
  if (flags.synth === true) {
    file = await synthVoice(opts, flags);
    synth = true;
  }
  if (!file) {
    const found = newestMedia();
    if (!found) die("E_NO_INPUT: no media in exports/ or outputs/ — pass a file: audio analyze path.mp4");
    file = found;
  }
  file = path.resolve(file);
  if (!existsSync(file)) die(`E_NO_INPUT: ${file}`);
  ensureOutDir();

  const filter = "ebur128=peak=true:framelog=quiet,astats,silencedetect=d=1:n=-50dB";
  const res = await ffmpeg(["-i", file, "-af", filter, "-f", "null", "-"]);
  if (res.error && !/Output file is empty/.test(res.stderr)) {
    if (/does not contain any stream|matches no streams/.test(res.stderr)) die(`E_NO_AUDIO: ${rel(file)} has no audio stream`);
    die(`E_FFMPEG: ${res.stderr.slice(-1500)}`);
  }
  const report = { file: rel(file), synth, ...parseLoudness(res.stderr) };
  if (report.integratedLufs !== null) {
    report.targetLufs = -14;
    report.withinTarget = report.integratedLufs >= -15 && report.integratedLufs <= -13;
    report.truePeakOk = report.truePeakDbfs === null ? null : report.truePeakDbfs <= -1;
  }
  writeFileSync(path.join(OUT, "loudness.json"), JSON.stringify(report, null, 2));

  if (flags.waveform === true || flags.waveform === "true") {
    let accent = "0xCFFF47";
    try {
      const packId = typeof opts.pack === "string" ? opts.pack : "mstudio";
      const pack = JSON.parse(readFileSync(path.join(ROOT, "src", "packs", `${packId}.json`), "utf8"));
      const theme = pack.themes?.[1] ?? pack.themes?.[0];
      if (theme?.accent) accent = "0x" + String(theme.accent).replace("#", "");
    } catch {
      // cosmetic fallback color
    }
    const wave = await ffmpeg(["-y", "-i", file, "-filter_complex", `showwavespic=s=1200x240:colors=${accent}`, "-frames:v", "1", path.join(OUT, "waveform.png")]);
    if (wave.error) log(`[audio] waveform failed: ${wave.stderr.slice(-400)}`);
    else log(`[audio] wrote ${rel(path.join(OUT, "waveform.png"))}`);
  }

  if (wantJson(flags)) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    const lufs = report.integratedLufs === null ? "n/a" : report.integratedLufs.toFixed(1);
    const peak = report.truePeakDbfs === null ? "n/a" : report.truePeakDbfs.toFixed(1);
    const sample = report.samplePeak === undefined ? "n/a" : report.samplePeak.toFixed(3);
    process.stdout.write(
      `${report.file}\n` +
        `  integrated: ${lufs} LUFS (target -14 ±1)  true peak: ${peak} dBTP (want <= -1)  sample peak: ${sample}  LRA: ${report.lraLu ?? "n/a"} LU\n` +
        `  clipping: ${report.clipping ? "YES" : "no"}` +
        (report.clippedSamples !== null && report.clippedSamples !== undefined ? ` (${report.clippedSamples} samples)` : "") +
        `  silences: ${report.silences.length}` +
        (report.silences.length ? ` (${report.silences.map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)}s`).join(", ")})` : "") +
        `\n  report: ${rel(path.join(OUT, "loudness.json"))}\n`,
    );
  }
  if (report.clipping === true) return 2;
  if (report.truePeakOk === false) return 2;
  return 0;
}

// ---------------------------------------------------------------- main

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional.shift();
  if (!cmd || cmd === "help" || flags.help === true) {
    process.stdout.write(USAGE + "\n");
    return cmd ? 0 : 1;
  }
  const opts = harnessOpts(flags);
  ensureOutDir();

  if (cmd === "audio") return cmdAudio(flags, opts, positional);

  const session = await openSession(flags);
  try {
    switch (cmd) {
      case "timeline":
        return await cmdTimeline(session, opts, flags);
      case "inspect":
        return await cmdInspect(session, opts, positional, flags);
      case "strip":
        return await cmdStrip(session, opts, positional, flags);
      case "frame":
        return await cmdFrame(session, opts, positional, flags);
      case "onion":
        return await cmdOnion(session, opts, positional, flags);
      case "bench":
        return await cmdBench(session, opts, flags);
      default:
        die(`E_UNKNOWN_COMMAND: ${cmd}\n${USAGE}`);
    }
  } finally {
    await session.close();
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((e) => {
    process.stderr.write(`E_FATAL: ${harnessError(e)}\n`);
    process.exitCode = 1;
  });
