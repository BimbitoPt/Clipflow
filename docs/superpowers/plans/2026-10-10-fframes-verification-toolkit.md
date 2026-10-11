# Plan: fframes ideas → Clipflow (Phase 1: study + verification toolkit)

**Date:** 2026-10-10
**Status:** done (Phases 0–5 complete — see Completion notes at the bottom)
**Source:** study of [fframes](https://github.com/dmtrKovalenko/fframes) / [fframes.studio](https://fframes.studio/)
**Decision (user):** adopt **ideas only for now**. Native-renderer integration and replacing
Remotion studio are **later phases**, explicitly out of scope here.

---

## Why

fframes (Rust, MIT) renders programmatic video fast and — more importantly for Clipflow —
is built for **an author that cannot watch**: every project ships a CLI (`inspect`, `strip`,
`onion`, `frame`, `audio analyze`, `snapshot`, `--draft`) so a coding agent verifies a render
via PNGs, contact sheets and loudness numbers instead of watching video. Clipflow is
agent-driven (system/AGENTS.md, superpowers plans) but has **no equivalent tooling**: to judge
a render today a human must open the preview or export an MP4.

Three borrowable wins, in order of value:

1. **Agent verification CLI** over the existing `drawFrame()` pipeline (src/lib/render.ts:480).
2. **drawFrame performance** — measure, then memoize the per-frame work that is actually
   constant (text fitting runs a binary search over `measureText` *every frame* even when the
   result is unused, src/lib/render.ts:700-735).
3. **Audio-mix model** — fframes' `AudioMap` (per-track gain/fades/pan, `duck_under_voice()`,
   −1 dBFS limiter, −14 LUFS target) for Clipflow's listed-but-unbuilt music-mixing work
   (docs/desktop-app-direction.md).

Full teardown of how fframes works goes into `docs/fframes-study.md` (Phase 0), including the
future native/Remotion evaluation notes.

---

## Phase 0 — Study document

**Create `docs/fframes-study.md`** covering:

- Architecture: `Video` trait → `svgr!` macro (compile-time static-subtree hashing) →
  CPU (tiny-skia) / GPU (Skia Metal/Vulkan) backends → encoder negotiation (hardware-frame
  passthrough → GPU yuv conversion → RGBA readback) → linked libav encode.
- Agent CLI command table and time syntax (`3.2s`, `50%`, `hook@50%`, ranges `a..b`, `--json`,
  exit code 2).
- Audio map: gains, fades, ducking, limiter, LUFS verification.
- Skill-first distribution (`npx skills add https://fframes.studio`), WASM editor.
- **Fit analysis for Clipflow:** DIY PWA keeps Canvas/WebCodecs (fframes cannot run there);
  `native/` CLI + Tauri + SaaS are the future integration candidates; Windows friction
  (shared FFmpeg 9 build + LLVM/libclang, first Skia build ~20 min from source).
- Future phases (4/5) sketched: native renderer spike, Remotion replacement evaluation.
- What Phase 1 of this plan builds (links to sections below).

## Phase 1 — Agent verification CLI

Architecture: **driver script (Node) + in-browser harness (real Canvas, real fonts)** so
frames are pixel-identical to preview/export. No new dependencies (Playwright, ffmpeg-static,
vite already in devDeps).

### New files

| file | role |
|---|---|
| `inspect.html` | bare vite HTML entry at repo root (dev server only; not part of the PWA build) |
| `src/inspect/harness.ts` | imports `src/lib/planner.ts`, `src/lib/render.ts`, `src/lib/script.ts`, `src/packs/*.json`, `shared/caption-plan.ts`; exposes `window.__cf` API |
| `scripts/video.mjs` | driver: starts vite dev (port 8099), drives Playwright, writes outputs |

### Harness API (`window.__cf`, called via `page.evaluate`)

- `timeline(opts)` → cues with frame/second ranges, word/caption spans, variant per cue.
- `renderFrames(times, opts)` → per frame: `{ t, cue, png (dataURL), issues[] }`;
  `opts`: `{ pack, idea, asset?, captions, cache?: boolean }`.
- `strip(times, opts)` → one contact-sheet PNG dataURL (labelled cells, columns default 4).
- `onion(times, opts)` → blended PNG dataURL.
- `bench(n)` → ms/frame stats for `drawFrame`.

Harness specifics:

- Theme from pack JSON; script via `buildScript()` defaults; frames via `planFrames()`;
  captions via `shared/caption-plan.ts`; word fallback via `planWords()` (45s grid) when no
  measured timings — same path the app uses without voice.
- Optional b-roll: load a real `public/broll` still as `Image` (check `naturalWidth`).
- `ctx` instrumentation: wrap `fillText` to record ink boxes (x, y, width) for bounds checks;
  after each `drawFrame` read `ctx.getTransform()` and flag non-finite values.

### Driver subcommands (`node scripts/video.mjs <cmd>`)

| command | output | notes |
|---|---|---|
| `timeline [--json]` | stdout table / JSON | cues, frame ranges, variants, caption spans |
| `inspect [--every 0.25s] [--json] [--pack X] [--idea X]` | issue list; **exit 2 on errors** | see checks below |
| `strip [RANGE] -n 12 [--columns 4]` | `outputs/inspect/strip.png` | |
| `frame <times...>` | `outputs/inspect/frames/*.png` | full-size |
| `onion <RANGE> -n 6` | `outputs/inspect/onion.png` | |
| `audio analyze <file> [--waveform] [--synth]` | `outputs/inspect/loudness.json` + `waveform.png` | ffmpeg-static `ebur128` + `astats` + `silencedetect`; `--synth` generates per-cue Kokoro VO the same way scripts/render-product-demo.mjs does (`kokoro-js` in Node) |
| `bench [--frames 300]` | stdout ms/frame | baseline for Phase 2 |

Time syntax (fframes-style): frame `120`, `3.2s`, `50%`, cue name (`hook`, `beat1`…`cta`),
`hook@50%`, ranges `a..b`. Default pack `mstudio`.

### Inspect checks (v1)

| code | level | check |
|---|---|---|
| `E_THROW` | error | `drawFrame` threw (violates the never-throw contract) |
| `E_ASSET_MISSING` | error | b-roll image failed to load / zero-size |
| `W_TEXT_OUT` | warning | `fillText` ink box outside canvas bounds (0..W / 0..H) |
| `W_NAN` | error | non-finite `getTransform()` after the frame |
| `W_BLANK` | warning | sampled pixels uniform (blank frame) |
| `W_FREEZE` | warning | pixel-identical samples across >1s of sampled frames |

`--json` prints one JSON document on stdout; progress/logs to stderr (fframes convention).

### Wiring

- `package.json` scripts: `"video": "node scripts/video.mjs"` (subcommands via args).
- Ensure `outputs/inspect/` is gitignored (check `.gitignore` for `outputs/`; extend if needed).

## Phase 2 — drawFrame performance

1. **Measure first:** `video bench` baseline (720×1280, default pack, with/without asset).
2. **Safe memo wins (no visual change):**
   - Resolve `captionPlan` (render.ts:736) **before** the `fitLargest` computation and only
     run the binary-search text fitting when `captionPlan === null` — today it runs every
     frame and its result is discarded in the common captioned path (render.ts:697-735).
   - Memoize `fitLargest` per `(text, font, fitW)` so the fallback path also stops
     re-measuring every frame.
3. **Evaluate (gate, do not assume) a static-backdrop cache:** key =
   `(W,H,theme,asset,visualEffect,footage,cue-variant)` → cached `OffscreenCanvas` holding
   time-invariant layers (gradient bg, still b-roll + dim, grade); dynamic layers (scene
   animation, motion graphic, captions, edge dip, bars) always redraw. The 1.08× zoom wraps
   bg+scene+broll (render.ts:553-585), so the cache must be drawn through the same transform.
   **Ship only if** `video bench --parity` (A/B with `cache:false`) shows pixel diff at or
   near zero; otherwise record the result in the study doc and stop.
- Contract preserved: never throw; preview↔export parity is the release gate.

## Phase 3 — Audio-mix model (shared, spec + pure code)

- **Create `shared/audio-mix.ts`** (pure, zero-dep, per docs/architecture.md cross-renderer
  rule): track model `{ src, startSec, endSec?, gainDb, fadeInSec, fadeOutSec, duckUnderVoice,
  voice }`; resolver that turns tracks + voice presence into a piecewise gain envelope
  (duck depth −12 dB, attack/release ramps like fframes) and documents master-bus −1 dBFS
  limiting + −14 LUFS integrated target.
- Unit tests (`shared/audio-mix.test.ts`, vitest): ducking envelope edges, fades, offsets,
  overlap summation.
- **`docs/fframes-study.md` §audio** documents integration points (not built now):
  browser export via `OfflineAudioContext` before the `AudioEncoder`, native CLI via
  ffmpeg sidechaincompress, Remotion via its audio props.
- `video audio analyze` (Phase 1) is the verification tool for this model.

## Out of scope (later phases, per user)

- **Phase 4 — fframes as native renderer:** spike in `native/` / Tauri (Windows: `FFMPEG_DIR`
  shared FFmpeg 9 + LLVM + Skia source build); evaluate replacing the base64-PNG IPC pipe
  (docs/native-desktop.md:40) and the ffmpeg filter-graph CLI. Requires porting the visual
  language to SVG — record feasibility in the study doc only for now.
- **Phase 5 — Replace Remotion studio** with fframes (same "code-defined video, batch render"
  role; fframes is faster and Rust).
- Shipping a Clipflow agent skill (`npx skills add` style) — note it in the study doc as an
  idea, do not build.

---

## Verification

1. `npm run build` (tsc) and `npm test` stay green (root suite, 175 tests).
2. CLI smoke: every subcommand runs against defaults; `inspect` exits 0 clean and 2 with a
   forced fault (temporary harness fault-injection flag); `--json` parses.
3. `strip.png`, `onion.png`, `frames/*.png` open and show the expected cue/frames; waveform +
   loudness JSON produced (target ≈ −14 LUFS noted in output).
4. Phase 2: bench delta reported before/after; `--parity` pixel diff gate before any cache
   ships.
5. Study doc exists and links the future native/Remotion phases.

## Execution order

Phase 0 → Phase 1 (harness → driver → checks → audio) → Phase 2 (bench → memo → gated cache)
→ Phase 3 (model + tests) → final verification pass.

---

## Completion notes (2026-10-10)

All four phases landed. Final state: root suite **205/205**, `npm run build` green,
`bench --parity` **0/300 mismatched** (stable across runs), `inspect` 0 errors / 0 warnings.

### Phase 1 findings

- All CLI subcommands work: `timeline`, `inspect`, `strip`, `frame`, `onion`, `bench`,
  `audio analyze` (LUFS/true-peak/silences/waveform). Exit 2 verified via `--fault throw`.
- This ffmpeg-static build's `astats` omits "Number of clipped samples"; the driver derives
  clipping from the Overall block's min/max sample level (|level| ≥ 1.0) and reports
  `sample peak` alongside true peak.
- Default idea in the harness avoids reusing pack hook-bank lines (doubled hook text).

### Phase 2 — drawFrame memoization + parity gate

- `captionPlan` now resolves **before** text fitting; the `fitLargest` binary search runs only
  on the no-captions fallback path. Both that search and `drawPhraseCaption`'s shrink-to-fit
  loop are memoized (`fitCache`, `phraseLayoutCache`, 256/512-entry caps) behind the new
  `setFrameCacheEnabled()` export (render.ts). Layout is deterministic, so memo == cold path —
  gated and proven by `bench --parity` (0 mismatched, including the video-cued frames).
- Bench after: cache p50 ≈ 3.3 ms vs no-cache ≈ 4.3 ms at 720×1280 (budget 33 ms).
- **Static-backdrop cache: evaluated, not shipped.** With text-fit fixed, remaining cost is
  animated scene painting; a backdrop cache buys ~0 ms and adds staleness risk. Revisit only
  if bench regresses.
- **Video b-roll parity discovery (pre-existing, now fixed in the harness):** beat cues can
  assign a *playing* `<video>`; `drawImage` samples the wall-clock frame, so parity/strip/
  inspect differed run-to-run from the first video frame onward (180/300 mismatched).
  Fixes in `src/inspect/harness.ts`:
  - `seekVideoForFrame()` — pause + seek to the timeline position (+ `requestVideoFrameCallback`
    so the presented frame, not just `currentTime`, has updated) before every draw;
    strip/inspect/frames/onion now seek per frame (deterministic single-pass artifacts).
  - `bench` freezes each video at its first-used frame via a **canonical seek** (0 → target)
    so both parity passes decode the identical picture; media state
    (`currentTime`/`readyState ≥ 2`) is asserted per video frame.

### Phase 3 — shared audio-mix model (scoped to shipped behavior)

- `shared/audio-mix.ts` is the single source of truth for the audio numbers that were
  copy-pasted across the repo: VO window fit/tempo (`cueFit`), peak-normalize gain
  (`peakGain`), ffmpeg placement/mix/pad (`voicePlacement`, `voiceMixTail`), Remotion ducking
  policy (`DUCK`, `musicVolumeAt`, `SFX`), octane chains (`ambientChain`, `musicBedChain`,
  `limiterChain`), `LOUDNORM`.
- Wired: `scripts/video.mjs` (synth path), `scripts/render-product-demo.mjs`,
  `scripts/render-landing-hero.mjs` (esbuild-bundled import, same pattern as their TS
  entries), `remotion-studio/.../WithSoundtrack.tsx`, `render-octane-edits-ffmpeg.ts`.
- Tests live at `src/lib/audio-mix.test.ts` (root vitest only collects `src/**`, matching
  `motion-tokens.test.ts`) and **pin the previously implicit constants** (0.055/0.18,
  0.12/0.26, 0.15 lead, 0.42/0.32/0.3 SFX, amix flags, adelay rounding).
- Deviation from plan text: the aspirational piecewise gain-envelope track model (duck
  −12 dB ramps, `gainDb` per track) was **not** built — it has no consumer yet. This phase
  extracted today's shipped numbers faithfully; the envelope model layers on later when
  music mixing actually ships.
- remotion-studio suite: `WithSoundtrack.test.tsx` 4/4 green. `batch-store.test.ts` failure
  is **pre-existing** (reproduced with these changes stashed).

### Phase 4 — fframes as native renderer (2026-10-11, user: "do the later phases")

- Spike crate `native/fframes-spike/` (self-contained; README covers env setup):
  BtbN FFmpeg 9.0 gpl-shared staged in `deps/ffmpeg`, LLVM 23 via winget, **default CPU
  backend — no Skia build**. Gotcha: `libav-agree-*`/codec features force from-source
  FFmpeg (broken on Windows); DLLs on PATH at build *and* run time.
- `src/clip.rs` = SVG port of `drawFrame` (rays, hook card shrink-to-fit, caption,
  edge dip, motion bar, progress, end card), parameterized by cues + pack theme;
  fonts embedded as files (Segoe UI ×2 + Consolas).
- Agent CLI proven: `timeline`, `inspect --every 1s`, `strip`, `frame`, `onion`,
  `render [--draft]`, `--json`, exit 2. inspect caught real bugs on first run
  (zero-width SVG rects where canvas tolerates 0; missing font-family); also flagged the
  **fallback-caption bottom overflow** — a pre-existing drawFrame quirk reproduced faithfully.
- Perf: **45s/1350 frames 720×1280 draw+encode = 7.7s (5.7 ms/frame)**, draft 3.3s.
  vs Phase 2 canvas bench ≈3.3 ms/frame draw-only (+PNG/base64/IPC in the Tauri path).

### Phase 5 — Remotion studio replacement (2026-10-11)

- `src/bin/batch.rs`: 3 × 15s cuts (mstudio ×2 + clipflow lime) sequential in **8.1s
  total (6 ms/frame)** — one static binary, no Node/Chromium/Next bundle.
- `src/audio_mix.rs`: Rust port of `shared/audio-mix.ts`; **7 `cargo test`s pin the TS
  numbers and filter-graph strings** (duck 0.055/0.18 + 0.12/0.26 @ 0.15 lead, SFX,
  cueFit/peakGain, amix/adelay/pad graphs, loudnorm/limiter).
- Open for a full A/B: real remotion-studio compositions side-by-side (bundle+Chromium
  timing), audio muxing in the batch (`AudioMap` wired, spike is silent), full cue
  vocabulary port. Decision + evidence: `docs/fframes-study.md` §7.
