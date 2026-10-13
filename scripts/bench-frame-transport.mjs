#!/usr/bin/env node
// Benchmarks the two desktop frame transports end to end.
//
//   PNG path (shipped): canvas.toDataURL("image/png") + base64 split -> one
//       invoke per frame -> FFmpeg `-f image2pipe -vcodec png`.
//   Raw path (batched): ctx.getImageData + copy into a fixed slot -> one
//       invoke per 4 frames -> FFmpeg `-f rawvideo -pixel_format rgba`.
//
// The JS half runs in Chromium against real rendered frames via the inspect
// harness (src/inspect/harness.ts, window.__cf.transport). The FFmpeg half
// replays the exact frame bytes through both input demuxers, so the encode
// work is identical and only the ingest path differs.
//
//   node scripts/bench-frame-transport.mjs [--frames 90] [--port 8099] [--json]
//
// See docs/codebase-review.md (P1, desktop frame transport).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "outputs", "inspect");
const FFMPEG = path.join(ROOT, "node_modules", "ffmpeg-static", "ffmpeg.exe");
const W = 720;
const H = 1280;
const FPS = 30;
const ENCODE = ["-c:v", "libx264", "-preset", "fast", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags[key] = true;
    else { flags[key] = next; i++; }
  }
  return flags;
}

function log(...parts) { process.stderr.write(parts.join(" ") + "\n"); }
function die(msg) { process.stderr.write(`${msg}\n`); process.exit(1); }
function mib(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)} MiB`; }
function secs(ms) { return `${(ms / 1000).toFixed(2)}s`; }

// ------------------------------------------------------------ dev server

async function ping(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; }
  catch { return false; }
}

async function ensureServer(port) {
  const url = `http://localhost:${port}/inspect.html`;
  if (await ping(url)) return { url, child: null };
  const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) die("E_NO_VITE: node_modules missing — run npm install first");
  log(`[bench] starting vite dev server on :${port}…`);
  const child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, VITE_LOG_LEVEL: "warn" },
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d; });
  child.stderr.on("data", (d) => { bootLog += d; });
  const exited = new Promise((r) => child.once("exit", r));
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

async function openSession(port) {
  const server = await ensureServer(port);
  let chromium;
  try { ({ chromium } = await import("@playwright/test")); }
  catch (e) { die(`E_NO_PLAYWRIGHT: ${e.message} — run: npm install`); }
  let browser;
  try {
    // --enable-precise-memory-info stops performance.memory from being
    // quantized, so the per-frame heap deltas are actually comparable.
    browser = await chromium.launch({
      args: ["--enable-precise-memory-info"],
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    });
  } catch (e) { die(`E_NO_BROWSER: chromium unavailable — run: npx playwright install chromium\n${e.message}`); }
  const page = await browser.newPage();
  page.on("pageerror", (err) => log("[bench] harness page error:", err.message));
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
      if (server.child) { server.child.kill(); await new Promise((r) => setTimeout(r, 150)); }
    },
  };
}

// --------------------------------------------------------- peak memory

/**
 * Read one process's PeakWorkingSet64. Returns 0 when the process is already
 * gone (or invisible to Get-Process) — the caller treats that as "no sample".
 */
function readPeakOnce(pid) {
  try {
    const r = spawnSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-Command",
      `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).PeakWorkingSet64`,
    ], { encoding: "utf8", timeout: 8000 });
    const n = Number.parseInt(String(r.stdout || "").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll PeakWorkingSet64 from this process while `isAlive()` holds. Polling
 * from Node (instead of a second long-lived powershell loop) keeps working
 * even for short FFmpeg runs, and can never hang the benchmark: it stops as
 * soon as the child exits and resolves null when nothing was ever sampled.
 */
async function trackPeakRss(pid, isAlive) {
  // Give a short-lived child a chance to become visible before first sample.
  for (let i = 0; i < 20 && isAlive() && readPeakOnce(pid) === 0; i++) await sleep(25);
  let m = 0;
  while (isAlive()) {
    const v = readPeakOnce(pid);
    if (v > m) m = v;
    await sleep(25);
  }
  const last = readPeakOnce(pid);
  if (last > m) m = last;
  return m > 0 ? m : null;
}

/** Run one FFmpeg ingest path, reporting wall time and peak RSS. */
async function runFfmpeg(args, stdinChunks) {
  const started = performance.now();
  const child = spawn(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
  let alive = true;
  child.once("exit", () => { alive = false; });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });
  const peak = trackPeakRss(child.pid, () => alive);
  const exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));
  for (const chunk of stdinChunks) {
    if (!child.stdin.write(chunk)) {
      await new Promise((r) => child.stdin.once("drain", r));
    }
  }
  child.stdin.end();
  const code = await exited;
  const ms = performance.now() - started;
  const peakRss = await peak;
  if (code !== 0) die(`E_FFMPEG: exit ${code}\n${stderr.slice(-2000)}`);
  return { ms, peakRss };
}

// --------------------------------------------------------------- main

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const frames = Number(flags.frames) > 0 ? Number(flags.frames) : 90;
  const port = Number(flags.port) > 0 ? Number(flags.port) : 8099;
  const wantJson = flags.json === true || flags.json === "true";
  if (!existsSync(FFMPEG)) die(`E_NO_FFMPEG: ${FFMPEG} missing — run npm install`);
  mkdirSync(OUT, { recursive: true });

  const session = await openSession(port);
  let result;
  try {
    log(`[bench] rendering ${frames} real frames in Chromium…`);
    result = await session.page.evaluate(
      ([n]) => window.__cf.transport(n),
      [frames],
    );
  } finally {
    await session.close();
  }

  if (result.parity.mismatched) {
    log(`E_PARITY: PNG round trip disagreed with raw pixels at frame ${result.parity.firstMismatch}`);
    process.exitCode = 1;
  }

  // ---- FFmpeg half: replay the identical frames through all three demuxers.
  // ---- (rgba is the previous step's path, kept to isolate the rgb24 delta.)
  const pngs = result.samplePng.map((b64) => Buffer.from(b64, "base64"));
  const pngStream = Buffer.concat(pngs);
  log(`[bench] decoding ${pngs.length} sample frames to raw RGBA + RGB24 (setup, untimed)…`);
  const decode = (pixFmt) => spawnSync(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-vcodec", "png", "-i", "pipe:0",
    "-f", "rawvideo", "-pix_fmt", pixFmt, "pipe:1",
  ], { input: pngStream, maxBuffer: 1 << 30 });
  const decRgba = decode("rgba");
  if (decRgba.status !== 0) die(`E_DECODE: ${String(decRgba.stderr).slice(-2000)}`);
  const decRgb = decode("rgb24");
  if (decRgb.status !== 0) die(`E_DECODE_RGB: ${String(decRgb.stderr).slice(-2000)}`);
  const raw = decRgba.stdout;
  const rawRgb = decRgb.stdout;

  const tmp = path.join(OUT, "bench-frame-transport");
  mkdirSync(tmp, { recursive: true });
  const outPng = path.join(tmp, "ingest-png.mp4");
  const outRaw = path.join(tmp, "ingest-raw.mp4");
  const outRgb = path.join(tmp, "ingest-rgb.mp4");

  log(`[bench] encoding ${pngs.length} frames via image2pipe/png (old path)…`);
  const pngRun = await runFfmpeg(
    ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-vcodec", "png", "-i", "pipe:0", ...ENCODE, outPng],
    pngs,
  );

  log(`[bench] encoding the same ${pngs.length} frames via rawvideo/rgba (previous step)…`);
  const rawRun = await runFfmpeg(
    ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", "pipe:0", ...ENCODE, outRaw],
    [raw],
  );

  log(`[bench] encoding the same ${pngs.length} frames via rawvideo/rgb24 (new path)…`);
  const rgbRun = await runFfmpeg(
    ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", "pipe:0", ...ENCODE, outRgb],
    [rawRgb],
  );

  // ---- Totals. JS numbers extrapolate to the full export; FFmpeg numbers are
  // ---- per frame measured on the sample, scaled the same way. The new path's
  // ---- conversion is read + strip + rgb-copy, all measured in Chromium.
  const n = result.frames;
  const scale = (msPerFrame) => msPerFrame * n;
  const pngEncodeMs = scale(pngRun.ms / pngs.length);
  const rgbEncodeMs = scale(rgbRun.ms / pngs.length);
  const rgbConvertMs = scale(result.raw.getImageDataMs + result.rgb24.stripMs + result.rgb24.copyMs);
  const rgbBytes = Math.round(result.raw.bytes * 0.75);
  const rgbCalls = Math.ceil(n / 4);

  const report = {
    frames: n,
    width: result.width,
    height: result.height,
    frameBytes: result.frameBytes,
    rgbFrameBytes: Math.round(result.frameBytes * 0.75),
    js: {
      png: { totalMs: result.png.totalMs, avgMs: result.png.avgMs, bytes: result.png.bytes, ipcCalls: result.png.ipcCalls, peakHeapBytes: result.png.peakHeapBytes },
      raw: { totalMs: result.raw.totalMs, avgMs: result.raw.avgMs, getImageDataMs: result.raw.getImageDataMs, copyMs: result.raw.copyMs, bytes: result.raw.bytes, ipcCalls: result.raw.ipcCalls, peakBatchBytes: result.raw.peakBatchBytes, peakHeapBytes: result.raw.peakHeapBytes },
      rgb24: { totalMs: +rgbConvertMs.toFixed(1), avgMs: +(rgbConvertMs / n).toFixed(3), stripMs: result.rgb24.stripMs, copyMs: result.rgb24.copyMs, bytes: rgbBytes, ipcCalls: rgbCalls, peakBatchBytes: Math.round(result.raw.peakBatchBytes * 0.75) },
    },
    ffmpeg: {
      sampleFrames: pngs.length,
      pngIngest: { totalMs: +pngRun.ms.toFixed(1), perFrameMs: +(pngRun.ms / pngs.length).toFixed(2), peakRssBytes: pngRun.peakRss },
      rawIngest: { totalMs: +rawRun.ms.toFixed(1), perFrameMs: +(rawRun.ms / pngs.length).toFixed(2), peakRssBytes: rawRun.peakRss },
      rgbIngest: { totalMs: +rgbRun.ms.toFixed(1), perFrameMs: +(rgbRun.ms / pngs.length).toFixed(2), peakRssBytes: rgbRun.peakRss },
    },
    projected: {
      pngTotalMs: +(result.png.totalMs + pngEncodeMs).toFixed(1),
      rawTotalMs: +(rgbConvertMs + rgbEncodeMs).toFixed(1),
    },
    parity: result.parity,
    canvasParity: result.canvasParity,
    rgb24: result.rgb24,
    heapAvailable: result.heapAvailable,
  };

  // ---- PCM half: the old path boxes every sample (Array.from + JSON), the
  // ---- new path ships the Float32Array bytes verbatim. Measurable in Node.
  const pcmSamples = 16_000 * 60; // one minute of 16 kHz voice
  const pcm = new Float32Array(pcmSamples);
  for (let i = 0; i < pcmSamples; i++) pcm[i] = Math.sin(i * 0.061) * 0.5;
  const tJson0 = performance.now();
  const json = JSON.stringify(Array.from(pcm));
  const jsonMs = performance.now() - tJson0;
  const rawPcmBytes = pcm.byteLength;

  writeFileSync(path.join(OUT, "bench-frame-transport.json"), JSON.stringify(report, null, 2) + "\n");

  if (wantJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return 0;
  }

  const ratio = (a, b) => (b > 0 ? `${(a / b).toFixed(2)}x` : "n/a");
  const rgb = report.js.rgb24;
  const lines = [];
  lines.push(`Clipflow desktop frame transport — ${n} frames @ ${W}x${H}, ${FPS} fps`);
  lines.push(`frame = ${mib(result.frameBytes)} RGBA -> ${mib(report.rgbFrameBytes)} RGB24`);
  lines.push("");
  lines.push("Renderer-side conversion (Chromium, real frames):");
  lines.push(`  PNG + base64   ${result.png.totalMs.toFixed(0).padStart(6)} ms total   ${result.png.avgMs.toFixed(2)} ms/frame`);
  lines.push(`  RGB24 packs    ${rgb.totalMs.toFixed(0).padStart(6)} ms total   ${rgb.avgMs.toFixed(2)} ms/frame  (read ${result.raw.getImageDataMs.toFixed(2)} + strip ${rgb.stripMs.toFixed(2)} + copy ${rgb.copyMs.toFixed(2)})`);
  lines.push(`  speedup        ${ratio(result.png.totalMs, rgb.totalMs)}`);
  lines.push("");
  lines.push("IPC payload:");
  lines.push(`  PNG + base64   ${mib(result.png.bytes)} across ${result.png.ipcCalls} calls`);
  lines.push(`  raw RGB24      ${mib(rgb.bytes)} across ${rgb.ipcCalls} calls`);
  lines.push(`  wire size      RGB24 carries ${(rgb.bytes / Math.max(1, result.png.bytes)).toFixed(1)}x the PNG bytes (uncompressed pixels); calls ${(result.png.ipcCalls / Math.max(1, rgb.ipcCalls)).toFixed(1)}x fewer`);
  lines.push("");
  lines.push("FFmpeg ingest (same frames, same encoder args):");
  lines.push(`  image2/png     ${pngRun.ms.toFixed(0).padStart(6)} ms   ${report.ffmpeg.pngIngest.perFrameMs} ms/frame   peak RSS ${pngRun.peakRss ? mib(pngRun.peakRss) : "n/a"}`);
  lines.push(`  rawvideo/rgb24 ${rgbRun.ms.toFixed(0).padStart(6)} ms   ${report.ffmpeg.rgbIngest.perFrameMs} ms/frame   peak RSS ${rgbRun.peakRss ? mib(rgbRun.peakRss) : "n/a"}`);
  lines.push(`  speedup        ${ratio(pngRun.ms, rgbRun.ms)}`);
  lines.push("");
  lines.push(`Projected export time (conversion + encode, ${n} frames):`);
  lines.push(`  PNG path       ${secs(report.projected.pngTotalMs)}`);
  lines.push(`  RGB24 path     ${secs(report.projected.rawTotalMs)}`);
  lines.push(`  speedup        ${ratio(report.projected.pngTotalMs, report.projected.rawTotalMs)}`);
  lines.push("");
  lines.push("Peak memory:");
  lines.push(`  JS heap delta per frame  PNG ${mib(result.png.peakHeapBytes)}   raw ${mib(result.raw.peakHeapBytes)}`);
  lines.push(`  batch slots (RGB24)      ${mib(rgb.peakBatchBytes)} resident, bounded by 2 slots`);
  if (!result.heapAvailable) lines.push("  (performance.memory unavailable in this browser; JS heap numbers are 0)");
  lines.push("");
  lines.push(result.parity.mismatched
    ? `PARITY FAIL: PNG round trip differed from raw pixels at frame ${result.parity.firstMismatch}`
    : "Parity: PNG round trip is byte-identical to raw pixels on every sampled frame.");
  const cp = result.canvasParity;
  lines.push(cp.mismatched
    ? `CANVAS PARITY FAIL: willReadFrequently canvas differed from a default canvas at frame ${cp.firstMismatch} (max channel delta ${cp.maxDelta})`
    : `Canvas parity: willReadFrequently rasterization is byte-identical to a default canvas on all ${cp.checked} sampled frames (default-canvas getImageData ${cp.gpuGetImageDataMs} ms/frame vs ${result.raw.getImageDataMs} ms/frame).`);
  const r24 = result.rgb24;
  lines.push(r24.alphaNonOpaque > 0
    ? `RGB24 GATE FAIL: ${r24.alphaNonOpaque} non-opaque pixels, first at frame ${r24.alphaFirstNonOpaque} — alpha must not be dropped`
    : `RGB24 gate: all alpha = 255 on ${r24.checked} sampled frames — dropping alpha is pixel-safe (strip pass ${r24.stripMs} ms/frame, wire bytes x0.75).`);
  lines.push("");
  lines.push(`PCM upload (${(pcmSamples / 16000).toFixed(0)}s @ 16 kHz, ${(pcmSamples / 1e6).toFixed(2)}M samples):`);
  lines.push(`  Array.from + JSON  ${json.length.toFixed(0)} bytes (${(json.length / rawPcmBytes).toFixed(1)}x the raw ${(rawPcmBytes / 1024 / 1024).toFixed(1)} MiB), ${jsonMs.toFixed(0)} ms to serialize`);
  lines.push(`  raw f32 LE         ${rawPcmBytes} bytes, zero-copy view`);
  lines.push("");
  lines.push(`JSON written to ${path.relative(ROOT, path.join(OUT, "bench-frame-transport.json")).replace(/\\/g, "/")}`);

  rmSync(outPng, { force: true });
  rmSync(outRaw, { force: true });
  rmSync(outRgb, { force: true });

  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

main()
  .then((code) => { process.exitCode = code ?? 0; })
  .catch((e) => { process.stderr.write(`E_FATAL: ${e && e.message ? e.message : e}\n`); process.exitCode = 1; });
