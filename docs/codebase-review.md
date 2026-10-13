# Clipflow codebase review

Scope: source-level review of the React editor, browser export worker, desktop render bridge, planner, local TTS and Vite/PWA setup. This is not an exhaustive runtime audit. Findings distinguish confirmed code patterns from risks that still need measurement.

## Architecture: end-to-end

~~~mermaid
flowchart TD
  U[Creator enters an idea] --> APP[React editor: src/App.tsx]
  APP --> PROF[Profile and script generation]
  PROF --> SCRIPT[src/lib/script.ts + script-draft.ts]
  SCRIPT --> PLAN[src/lib/planner.ts]
  PLAN --> WORDS[Caption and word timing plan]
  APP --> ASSETS[Scene choices and media loading]
  ASSETS --> BROLL[src/lib/broll.ts + scene-assets.ts]
  WORDS --> DRAW[src/lib/render.ts shared canvas renderer]
  BROLL --> DRAW
  DRAW --> PREVIEW[Canvas preview]
  APP --> SAVE{Desktop or browser?}
  SAVE -->|Browser| SESSION[Session/local storage + OPFS upload store]
  SAVE -->|Tauri| PROJECT[Native .clipflow project commands]
  SESSION --> RESTORE[Restore editor state on reload]
  PROJECT --> RESTORE
  APP --> EXPORT{Export target}
  EXPORT -->|Browser| WORKER[export-worker-protocol.ts]
  WORKER --> CODEC[WebCodecs VideoEncoder / AudioEncoder]
  CODEC --> MUX[mp4-muxer in export-worker.ts]
  MUX --> MP4B[MP4 Blob / download]
  EXPORT -->|Desktop| DRENDER[desktop-render.ts]
  DRENDER --> IPC[Tauri invoke: begin_render / render_frames]
  IPC --> FFMPEG[Native Rust/FFmpeg render job]
  FFMPEG --> MP4D[Native MP4 output]
  APP --> TTS[tts.ts / tts-local.ts]
  TTS --> MODEL[SpeechT5 model + speaker embedding]
  MODEL --> AUDIO[PCM audio]
  AUDIO --> CODEC
  AUDIO --> FFMPEG
  REM[Remotion batch studio] -. separate surface .-> SHARED[shared modules]
  SAAS[SaaS / signal-house areas] -. separate surface .-> SHARED
~~~

### Main data flow

1. The editor holds the working idea, profile, script overrides, scene choices, caption settings and export state.
2. Script/planner modules turn the idea into timed cues and frame plans. Shared drawing code renders preview and export frames.
3. Browser export transfers frames/audio to a worker for encoding and muxing. Desktop export sends batched raw-RGB24 frames (binary IPC, 4/batch) and staged voice audio (binary upload claimed by token) to Tauri commands that own the native render job.
4. Browser projects rely on browser persistence and OPFS uploads. Desktop projects are serialized as native .clipflow project files.
5. Local TTS is lazy-loaded, but first synthesis may still need to download model assets.

Remotion and SaaS are shown as adjacent surfaces, not as a claim that every runtime boundary has been verified.

## Highest-priority findings

### P1 — Desktop frame transport is expensive ✅ fixed

**Evidence:** src/lib/desktop-render.ts encoded every frame with canvas.toDataURL('image/png'), extracted base64, then invoked render_frame once per frame. A 45-second 30 fps render meant roughly 1,350 PNG encodes and IPC calls before native encoding.

**Fix (shipped):** batched raw-RGB24 binary transport — `ctx.getImageData`, alpha stripped (`packRgb24`) into a two-slot `FrameBatcher` (`src/lib/frame-batch.ts`, 4 frames/batch), one `invoke('render_frames', Uint8Array, { headers })` per batch (`InvokeBody::Raw` + `x-clipflow-render-id`/`x-clipflow-frame-count` headers), strict byte-length validation in `src-tauri/src/render.rs`, FFmpeg input switched to `-f rawvideo -pixel_format rgb24`. Alpha is dropped only because every exported pixel is fully opaque (gated by the benchmark's alpha scan); RGB24 cuts wire bytes 25% versus RGBA with identical pixels. At most one batch in flight (frame order guaranteed), drawing overlaps transfer, cancellation/progress/cleanup semantics unchanged. The old `render_frame` command and the `base64` dependency were removed.

**Benchmark** (`node scripts/bench-frame-transport.mjs --frames 90`, 90 real frames @ 720x1280 in Chromium + identical frames through every FFmpeg demuxer):

| | PNG + base64 (before) | raw RGB24 batched (after) |
|---|---|---|
| Renderer conversion | 55.35 ms/frame | 16.72 ms/frame (**3.31x**; read 5.37 + strip 10.53 + copy 0.82) |
| IPC calls | 90 | 23 (**3.9x fewer**) |
| IPC payload | 42.7 MiB | 237.3 MiB (5.6x more bytes — uncompressed pixels; the honest trade) |
| FFmpeg ingest | 126.33 ms/frame, RSS 113.8 MiB | 92.53 ms/frame (**1.37x**), RSS 121.1 MiB |
| Projected export | 16.35 s | 9.83 s (**1.66x**) |
| Pixel parity | PNG round trip byte-identical to raw pixels on all sampled frames |

`willReadFrequently` on the export canvas is load-bearing for readback speed (5.37 vs 24.8 ms/frame `getImageData` on a default canvas) and provably pixel-identical to a default canvas on all sampled frames (see `canvasParity` in the benchmark JSON).

Peak extra JS memory is bounded by the two batch slots (2 × 10.5 MiB) regardless of export length. Per-frame transient allocation is higher (3.7 MiB ImageData vs 0.5 MiB base64 string) but short-lived; steady-state pressure is lower with no PNG/base64 churn.

### P1 — Desktop audio transport expands PCM into a normal JS array ✅ fixed

**Evidence:** renderDesktop sent Array.from(input.pcm) to begin_render.

**Fix (shipped):** binary PCM upload — the renderer ships the `Float32Array` storage verbatim (`f32ToLeBytes`, `src/lib/pcm-bytes.ts`) as an `application/octet-stream` body to a new `prepare_audio` command, which validates (non-empty, whole f32s, ≤ 10 minutes at 16 kHz, all finite) and encodes the 16-bit WAV itself. It returns a one-shot token that `begin_render` claims; the WAV path flows into the existing FFmpeg audio input, so encoding bytes are unchanged. Staging happens before the save dialog (FFmpeg opens its audio input at spawn); a cancelled dialog deletes the staged file, unclaimed tokens are swept after an hour, and shutdown/Drop discard the rest. `begin_render` no longer takes PCM at all.

**Benchmark** (same run as above, Node-side, 60 s @ 16 kHz = 0.96M samples): `Array.from` + `JSON.stringify` = 19.3 MB (5.0x the raw 3.7 MiB), 287 ms to serialize — at the 10-minute cap that scales to ~193 MB / ~3 s of pure serialization garbage. Raw f32 LE = 3.7 MB, zero-copy view.

### P1 — One React component owns too many responsibilities

**Evidence:** src/App.tsx owns project open/save/restore, local session persistence, media loading and cleanup, script planning, preview drawing, keyboard/lifecycle behavior, browser export, desktop export and export UI state.

**Why it hurts:** unrelated workflows collide in one component, effects have broad dependencies, and correctness is harder to test in isolation.

**Fix in small steps:**
1. Extract pure project/session serialization and validation.
2. Move export orchestration behind a typed ExportController without changing rendering.
3. Move upload/media lifecycle into a hook or service with explicit disposal.
4. Extract preview drawing into a hook that accepts a render snapshot.
5. Keep App.tsx as composition and event wiring. Avoid a full rewrite.

*(Resolved 2026-10-13 — all five steps landed: `src/lib/session.ts` +
`src/lib/storage.ts` (serialization + validation), `src/hooks/useExportController.ts`
+ `src/lib/browser-export.ts` (typed controller, worker orchestration),
`src/hooks/useSceneAssets.ts` (media lifecycle + disposal),
`src/components/PreviewRenderer.tsx`, and `src/hooks/useClipflowProject.ts`
(document + project lifecycle). App.tsx is 217 lines of composition: three
hook calls, derived-plan memos, and JSX. Typecheck, `vitest` (252) and
`npm run build` green.)*

### P1 — Browser storage access is not consistently guarded

**Evidence:** readSession and initialProfile catch storage errors, but projectDraft reads localStorage.getItem('clipflow.wordtimes') directly during render. readWordTiming also reads storage inside a try/catch, so the handling is inconsistent.

**Why it hurts:** privacy settings, storage failures or test environments can throw during React render and break the editor even though persistence should be optional.

**Fix:** centralize storage reads/writes behind a safe adapter. Treat timing as optional; storage failure must not crash preview or project dirty-state calculation.

*(Resolved 2026-10-13 — `src/App.tsx` and every hook read/write go through
the `src/lib/storage.ts` boundary (`browserStorage`, `safeStorageGet`) and the
try/catch adapters in `src/lib/session.ts`; App.tsx holds no direct
`localStorage` access. Covered by `src/lib/storage.test.ts` +
`src/lib/session.test.ts`. Pre-existing exception, untouched by this change:
`src/lib/upload-store.ts` still resolves `localStorage` behind its own
`typeof` guard for upload metadata.)*

### P2 — Async upload can target a different scene than the one the user chose

**Evidence:** onUpload awaits image decoding and persistence, then uses the render-captured selectedScene when applying the upload.

**Why it hurts:** if the user changes scenes while the upload is processing, the asset can be attached to the wrong scene.

**Fix:** capture selectedScene synchronously at the beginning of onUpload and use that captured index after awaits. Add a regression test that changes selection while a deferred upload is pending.

### P2 — Sidecar timing parsing trusts cue contents too much

**Evidence:** readWordTiming checks parsed.cues is an array, then casts it to TimedCueTiming[] without validating each cue's span tuple, finite bounds or word fields.

**Why it hurts:** malformed or manually edited localStorage data can flow into the timing planner. Some later paths defend themselves, but the boundary should reject invalid data.

**Fix:** add runtime guards for each cue, span, word and asset/window relationship. Reject the whole timing sidecar on invalid structure and fall back to estimated timing.

### P2 — Local TTS is not reliably first-run offline

**Evidence:** src/lib/tts-local.ts uses SpeechT5 model assets and a speaker-embedding URL on Hugging Face; the code comments note that the speaker URL uses mutable main and first synthesis needs network.

**Why it hurts:** “local-first” can be mistaken for “works offline immediately.” A clean install may fail offline, and a mutable asset reference weakens reproducibility.

**Fix:** make model readiness/download state explicit; pin model/embedding assets to immutable revisions; report offline/unavailable errors in the UI; document local inference versus initial download. Bundle assets only if download size and licensing permit it.

### P2 — PWA precache rules may not cover all offline dependencies

**Evidence:** vite.config.ts precaches JS, CSS, HTML and common image formats, but not JSON, WASM, audio/video or model files.

**Why it hurts:** offline operation may depend on runtime-cached resources that were never precached. This is a verification gap, not a proven failure.

**Fix:** inventory runtime assets and classify each as precached, runtime-cached or intentionally online-only. Add an offline smoke test for startup, editing, export and TTS readiness.

### P3 — Test discovery is narrower than the product surface

**Evidence:** vite.config.ts sets Vitest include to src/**/*.test.ts with the Node environment.

**Why it hurts:** TSX UI tests and tests outside src are not discovered by that pattern; DOM-dependent tests also need a browser-like environment. This may be intentional, but the configuration does not cover the whole app by itself.

**Fix:** define separate test projects/configs for pure Node logic, React/component tests and Playwright end-to-end tests. Make CI show which layer ran.

### P3 — Two package lockfiles create install ambiguity

**Evidence:** the repository contains both bun.lock and package-lock.json.

**Why it hurts:** contributors and CI can resolve dependencies through different package managers and lockfile histories.

**Fix:** choose one canonical package manager for CI and contributors, document it in the README, and keep only the intended lockfile unless dual-manager support is deliberate and tested.

## Refactor sequence

1. Stabilize correctness: capture upload target scene; guard storage; validate sidecar/project payloads.
2. Establish a baseline: run build/tests and benchmark browser versus desktop export at short, normal and long durations.
3. Reduce native transport cost: binary/chunked PCM and frame transport with cancellation/error tests.
4. Extract boundaries: project persistence, asset lifecycle and export controller, one at a time.
5. Add parity and offline tests: preview/export frame parity, caption timing, reopen project, cancellation, offline boot and TTS readiness.

Avoid a large component rewrite before the behavior has regression tests.

## Verification checklist

- [ ] npm ci
- [ ] npm run build
- [ ] npm test
- [ ] Playwright: upload while changing scenes; export with and without voice; cancel export; reload browser session; reopen desktop project.
- [ ] Compare preview/browser/desktop render output for the same project.
- [ ] Measure peak memory and wall time for 45-second and longer desktop exports.
- [ ] Test first-run TTS with network disabled and document expected behavior.
- [ ] Test PWA startup and core editor flows after service-worker installation while offline.

These commands and scenarios have not been run by this review. They are the verification plan, not claimed passing results.

## 15 product ideas, prioritized by user value

### Reliability and speed first
1. **Export preflight:** explain missing media, unsupported codecs, unavailable storage and TTS readiness before a long render.
2. **Fast preview mode:** low-resolution or reduced-frame preview for quick iteration, with a clear final-render toggle.
3. **Project health panel:** show missing assets, stale timings, storage usage and whether the project is portable.
4. **Caption quality controls:** per-word timing adjustments, line-break controls, safe-zone preview and platform presets.
5. **Voice polish presets:** normalize loudness, trim silence and preview voice pacing before rendering.

### Make repeat creation easier
6. **Portable project bundles:** one package with manifest, script, settings and media that can be reopened on another machine.
7. **Brand kits:** save fonts, colors, caption styles, intro/outro and preferred motion per creator or client.
8. **Niche script packs:** focused templates for product demos, devlogs, gaming clips, explainers, fitness and finance, with editable hooks and CTAs.
9. **Hook variants:** generate alternate hooks and compare them without rebuilding the whole project.
10. **Batch queue:** turn a list of ideas into drafts with reusable settings and a review-before-export step.
11. **Local b-roll library:** tag and search a creator's own footage locally, with explicit indexing and storage controls.
12. **Keyboard-first editing:** scene navigation, caption editing, preview and export shortcuts.

### Add only after the core workflow is dependable
13. **Platform export profiles:** reusable dimensions, caption safe zones and export presets per destination.
14. **Posting planner:** a local calendar and checklist for manually publishing finished videos; no auto-posting required.
15. **Outcome feedback loop:** optionally record views/retention and compare outcomes with hook style and format to inform future drafts.

**Recommendation:** build ideas 1–4 first. They improve the core promise of getting from idea to finished video without fighting the tool. Defer cloud collaboration, auto-posting and a large analytics product until reliability and repeat usage are demonstrated.
