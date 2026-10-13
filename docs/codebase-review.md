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
  DRENDER --> IPC[Tauri invoke: begin_render / render_frame]
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
3. Browser export transfers frames/audio to a worker for encoding and muxing. Desktop export sends PNG frames and PCM to a Tauri command that owns the native render job.
4. Browser projects rely on browser persistence and OPFS uploads. Desktop projects are serialized as native .clipflow project files.
5. Local TTS is lazy-loaded, but first synthesis may still need to download model assets.

Remotion and SaaS are shown as adjacent surfaces, not as a claim that every runtime boundary has been verified.

## Highest-priority findings

### P1 — Desktop frame transport is expensive

**Evidence:** src/lib/desktop-render.ts encodes every frame with canvas.toDataURL('image/png'), extracts base64, then invokes render_frame once per frame. A 45-second 30 fps render means roughly 1,350 PNG encodes and IPC calls before native encoding.

**Why it hurts:** PNG encoding/base64 conversion allocate extra memory and add serialization/IPC overhead. This is a clear performance risk; the actual wall-time impact needs a benchmark.

**Fix:** benchmark end-to-end export and per-frame time. Then replace per-frame base64 IPC with a binary-friendly/chunked bridge or temporary-file/frame-pipe strategy. Preserve cancellation, progress and cleanup semantics.

### P1 — Desktop audio transport expands PCM into a normal JS array

**Evidence:** renderDesktop sends Array.from(input.pcm) to begin_render.

**Why it hurts:** a Float32Array becomes a large array of boxed JS numbers before serialization. Long voice tracks can multiply transient memory and serialization work.

**Fix:** measure typical and worst-case PCM sizes. Prefer a binary payload or temporary PCM/WAV file supported by the native side. If the native command requires a number array, document the limit and reject unreasonable sizes.

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

*(Resolved 2026-10-13 — every read/write goes through `src/lib/storage.ts`
(`browserStorage`, `safeStorageGet`) and the try/catch adapters in
`src/lib/session.ts`; App.tsx holds no direct `localStorage` access. Covered
by `src/lib/storage.test.ts` + `src/lib/session.test.ts`.)*

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
