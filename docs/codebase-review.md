# Clipflow codebase review (updated 2026-10-14)

This source review reflects the current master after the editor extraction, desktop binary transport, timing-sidecar validation, voice-model pinning and upload/project fixes. It does not claim that the full test suite or Windows/PWA runtime was executed here.

## Executive readout

The codebase has improved materially since the earlier audit:
- App.tsx is now a composition layer over useClipflowProject, useSceneAssets, useExportController and PreviewRenderer.
- Desktop export replaced per-frame PNG/base64 calls with batched binary RGB24 frames and binary PCM staging.
- Word-timing sidecars have a runtime schema and reject malformed structures as a whole.
- Kokoro revisions are pinned, and desktop frame/audio transport contracts are explicit.
- Upload targeting and project save behavior received focused fixes.

The largest remaining risks are now asset readiness/offline guarantees, native render lifecycle safety, model packaging integrity, and keeping architecture documentation aligned with the implementation.

## End-to-end architecture

~~~mermaid
flowchart TD
  CREATOR[Creator enters an idea] --> APP[React editor: src/App.tsx]
  APP --> PROJECT[useClipflowProject]
  APP --> MEDIA[useSceneAssets]
  APP --> EXPORT[useExportController]
  APP --> SCRIPT[buildScript + script-draft]
  PROJECT --> SESSION[Browser session and safe storage]
  PROJECT --> NATIVEPROJ[Tauri project commands]
  MEDIA --> CHOICES[Scene choices and asset resolver]
  MEDIA --> STOCK[Local stock / generated keyframes / uploaded media]
  SCRIPT --> PLAN[planner: frames, cues and word timing]
  SESSION --> TIMING[Validated word-timing sidecar]
  TIMING --> PLAN
  CHOICES --> RENDER[Shared Canvas renderer]
  PLAN --> RENDER
  RENDER --> PREVIEW[PreviewRenderer]
  RENDER --> BROWSER[Browser export: WebCodecs worker]
  BROWSER --> MUX[mp4-muxer]
  MUX --> BLOB[MP4 Blob and download]
  RENDER --> DESKTOP[desktop-render.ts]
  DESKTOP --> RGB[RGB24 FrameBatcher + binary IPC]
  EXPORT --> AUDIO[TTS: Kokoro standard + timestamped path]
  AUDIO --> PCM[PCM conversion / sample-rate contract]
  PCM --> BROWSER
  PCM --> DESKTOP
  RGB --> RUST[src-tauri/src/render.rs]
  PCM --> RUST
  RUST --> FFMPEG[Native FFmpeg job]
  FFMPEG --> MP4[Native MP4 output]
  MODEL[model:install + public/models + public/ort] --> AUDIO
  POLL[Optional external keyframe provider] -. network/API-dependent .-> MEDIA
  REM[Remotion batch studio] -. separate runtime surface .-> SHARED[shared modules]
  MANAGED[Managed/SaaS and Signal House areas] -. separate product surface .-> SHARED
~~~

### How a video moves through the system

1. App.tsx composes project state, media state, script derivation and export orchestration.
2. The deterministic script builder produces five cues. Planner and timing validation produce frame/caption timing.
3. PreviewRenderer and both export paths use the shared Canvas drawing implementation.
4. Browser export sends VideoFrame/AudioData to a worker that encodes with WebCodecs and muxes MP4.
5. Desktop export converts Canvas pixels to RGB24 batches and voice PCM to a binary upload. Tauri Rust validates the contract and feeds FFmpeg.
6. Standard Kokoro generates audio locally; the timestamped model is an optional timing-quality path. Model files are staged by npm run model:install.
7. Optional keyframe generation can call an external provider. Local rendering does not mean every media-generation step is offline.

Remotion and Managed/SaaS are separate surfaces. Shared modules do not prove every surface is runtime-integrated.

## Findings: current priorities

### P1 — Voice preflight can report ready when required model files are missing

**Evidence:** src/lib/tts-local.ts checkVoiceAssets() checks the standard model config.json and the default voice bin. Standard synthesis also needs tokenizer.json, tokenizer_config.json, the quantized ONNX weights and ONNX Runtime WASM/module files staged by scripts/install-kokoro-model.mjs.

**Why it hurts:** a partial deployment, incomplete packaging step or manually deleted large file can pass preflight and then fail after heavyweight imports/model initialization. The user gets a late synthesis error instead of a useful missing-asset message. The timestamped model is different: it is intentionally optional and can fall back to the standard model.

**Fix:** preflight every required standard-model asset. Use HEAD for large weights so the check does not download ~92 MB just to confirm existence; GET the voice file when its bytes need to warm the voice cache. Add tests for each missing dependency. Keep timestamped-model absence as a soft fallback.

**Status in this PR:** checkVoiceAssets now HEAD-checks every required standard-model/runtime file without downloading the large ONNX weights, GETs the voice bin to warm the cache, and has tests for missing weights, offline failures and request methods. Timestamped-model files remain optional.

### P1 — Local-first does not guarantee durable offline voice assets in the PWA

**Evidence:** vite.config.ts Workbox precache patterns cover JS/CSS/HTML and common image formats, with a 3 MB precache-file cap. The .onnx, .json, .wasm, .mjs and .bin model/runtime assets are not covered by that pattern; the ONNX weights also exceed the cap.

**Why it hurts:** installing the PWA does not itself guarantee that every model/runtime file is cached for later offline synthesis. The model installer places files in public/models, but that only makes them available to the web build; it does not guarantee every browser persists them offline. HTTP cache eviction can break an implicit “used it once, so it always works offline” assumption.

**Fix:** make the trade-off explicit. Add a Download voice model setup step with progress, quota/error handling and a durable storage strategy (Cache Storage or OPFS where appropriate); expose verified readiness. Do not blindly precache ~150 MB during ordinary PWA installation. Add a Playwright offline test that disables network after model setup and synthesizes a short sample.

### P1 — Project save is safer, but not fully crash-atomic across manifest and assets

**Evidence:** src-tauri/src/projects.rs copies media into the sibling project assets directory before committing the manifest. The manifest helper stages a temp file and preserves/restores a backup, but asset copies and manifest replacement are not one transaction. The helper does not explicitly sync file contents/directories before rename.

**Why it hurts:** a crash or disk-full event during save can leave orphaned/partially copied assets, or a backup/temp file after an interrupted replacement. The old manifest is protected against ordinary rename failure, but safe replacement is not the same as power-loss durability for the entire project bundle.

**Fix:** treat a project as a bundle transaction. Copy assets into a uniquely named staging directory, validate copied assets, write and flush the staged manifest, then commit via a small journal/backup protocol. On open, detect and offer recovery for stale staging/backup files. Add failure-injection tests before introducing a complex journal.

### P2 — Native render lifecycle is a critical resource boundary

**Evidence:** src-tauri/src/render.rs owns the FFmpeg child process, temporary output/WAV/log files, one active job, pending audio tokens and cancellation/cleanup. JS dispatches ordered frame batches and cancels by job ID.

**Why it hurts:** failures can leave a child process, temp files or staged audio behind, or leave the UI believing export is busy. Concurrency, cancellation during binary IPC, window shutdown and FFmpeg exit errors are harder to exercise than pure planner logic.

**Fix:** test the state machine explicitly: begin; accept exactly N frames; finish; abort before begin; abort while a batch is in flight; bad frame count/byte length; FFmpeg exits early; duplicate/expired audio token; dialog cancel; app shutdown. Assert process termination and temp-file cleanup in every terminal path. Prefer a typed RenderJobState if the state becomes harder to reason about.

### P2 — Model installer verifies byte sizes, not content identity

**Evidence:** scripts/install-kokoro-model.mjs treats a file as ready if its size matches the expected byte count. It downloads pinned revisions and checks downloaded size, but does not compare a SHA-256 digest.

**Why it hurts:** a corrupted or substituted file of the expected length can pass the install check and fail later inside ONNX Runtime. Pinning the URL/revision is good; validating bytes gives a stronger integrity guarantee.

**Fix:** record trusted SHA-256 digests for each model file and compare after download. Store a small install manifest with model ID, revision, expected digest and actual digest. Hash package-supplied voice/WASM files too, or tie their checksums to the lockfile/package version. Keep downloads atomic via temp files.

### P2 — Standard and timestamped TTS paths duplicate setup assumptions

**Evidence:** src/lib/tts-local.ts and src/lib/tts-timed.ts each initialize Transformers environment flags, local model paths, WASM/thread behavior and asset loading, while the two models have different failure semantics.

**Why it hurts:** the paths can drift on runtime configuration or readiness. A fix to the standard path may not reach the timed path. The timed model is explicitly a soft upgrade, so that distinction must remain deliberate.

**Fix:** extract a small shared configureLocalInference() helper and shared asset-path/revision manifest. Keep separate model loaders and error policies. Add parity tests proving both loaders use local-only settings and that timestamped failure falls back to standard synthesis without remote model downloads.

### P2 — Model installation, desktop staging and runtime readiness are separate contracts

**Evidence:** model:install stages standard and timestamped weights, voice bin and ONNX runtime files. Runtime preflight checks assets. prepare-desktop.mjs copies staged files into .desktop-public based on file sizes.

**Why it hurts:** setup, runtime readiness and desktop staging each encode a slightly different view of “installed.” A successful script exit or equal file size does not prove the bundle contains every required asset or that the app can load it from the runtime path.

**Fix:** use one generated manifest consumed by installer, desktop staging, runtime preflight and tests. Add a packaging smoke test that builds the desktop public directory and asserts every required file exists with its expected digest.

### P3 — Architecture review documentation lagged behind the implementation

**Evidence:** docs/codebase-review.md still described SpeechT5 and the old per-frame render_frame/base64 pipeline in parts, although current code uses Kokoro, render_frames, RGB24 batches and binary PCM. Some older findings were marked fixed but the diagram retained stale labels.

**Why it hurts:** inaccurate diagrams send maintainers and agents toward components that no longer exist.

**Fix:** update the diagram and findings in the same PR as architectural changes. Add a docs-review checklist for changes to export transport, model dependencies, project format and browser/desktop boundaries.

### P3 — Test configuration is intentionally narrow

**Evidence:** vite.config.ts uses include: ["src/**/*.test.ts"] with the Node environment. That suits pure logic tests but excludes TSX test files and tests outside src.

**Why it hurts:** unit coverage can grow while user-visible editor, browser offline behavior and Tauri/FFmpeg integration remain untested. This is a coverage boundary, not proof tests are missing elsewhere in CI.

**Fix:** keep fast Node unit tests; add explicit Playwright projects for browser flows and a Windows desktop smoke workflow for Tauri/Rust/FFmpeg. Make CI report each layer independently.

## Improvements already shipped since the previous review

- **Editor composition:** App.tsx now delegates project, media and export lifecycles to hooks and uses PreviewRenderer.
- **Desktop frame transport:** PNG/base64-per-frame IPC was replaced by raw RGB24 binary batches. docs/codebase-review.md records a 1.66× projected export speedup for its tested workload; rerun on target hardware before treating that as universal.
- **Desktop audio transport:** PCM is uploaded as binary and staged by token instead of expanding samples into a JSON array. A 10-minute cap and explicit sample-rate/channel/format contract are present.
- **Timing integrity:** sidecar validation checks cue spans, word bounds/order, windows and asset counts and rejects malformed payloads as a whole.
- **TTS assets:** model revisions are pinned and the installer checks expected file sizes; timestamped timing is a soft upgrade.
- **Upload targeting:** async uploads retain the intended scene and surface a missing target.
- **Project saving:** manifest replacement preserves/restores the old manifest on ordinary rename failure.
- **Dead render API:** the unused injected seek callback was removed in favor of one strict native seek implementation.

These are meaningful improvements. The remaining recommendations are incremental reliability work, not a call to rewrite the architecture.

## Recommended order

1. Complete local-asset readiness checks and tests.
2. Add model content hashes and a generated asset manifest.
3. Make PWA voice setup explicitly downloadable and verifiably offline; do not download the full model during ordinary PWA installation without consent.
4. Add failure-injection tests for native render lifecycle and project bundle save/recovery.
5. Extract shared local-inference setup from the two TTS paths.
6. Keep the architecture diagram and runtime boundaries synchronized with code.
7. Only then expand editing features.

## Verification plan

Run these in CI or on the Windows development machine; they have not been executed as part of this source review:

- npm ci
- npm run build
- npm test
- cargo test --manifest-path src-tauri/Cargo.toml
- npm run model:install followed by manifest/digest verification
- npm run desktop:build on Windows
- Playwright: upload while changing scenes, save/open project, export with/without voice, cancel export, reload browser session
- Offline PWA: install, explicitly download model, disable network, synthesize a short voice sample and export a video
- Native failure injection: disk full/permission denied, missing model file, malformed frame batch, early FFmpeg exit, cancel during transfer and app shutdown

## 15 product ideas

### Reliability and time-to-first-export
1. **Voice setup wizard:** model size, download progress, disk-space estimate, readiness check and offline status.
2. **Export preflight:** catch missing media, codec issues, storage limits, unsupported voice setup and output-path problems before a long render.
3. **Project recovery:** detect autosave/backup/staging artifacts after a crash and offer recover/discard.
4. **Portable project health report:** show bundled versus linked media, timing source, renderer revision and missing files.
5. **Fast preview quality:** low-resolution preview with an explicit final-render switch.

### Improve the core creation loop
6. **Caption fine-tuning:** per-word timing nudges, line breaks, safe-zone preview and platform presets.
7. **Brand kits:** reusable fonts, colors, caption styles, intro/outro and motion rules per brand/client.
8. **Hook comparison:** generate alternative hooks and preview the opening seconds side by side.
9. **Niche packs with examples:** sample videos, editable script structures, voice pacing and CTA conventions.
10. **Batch idea queue:** turn a text list into drafts with shared brand settings and review-before-export.
11. **Local b-roll library:** searchable local footage with tags, thumbnails and no cloud upload.
12. **Keyboard-first editing:** scene switching, caption edits, preview and export shortcuts.

### Add after repeat usage is proven
13. **Local template packs:** versioned motion/caption packs that can be imported/exported as files.
14. **Publishing checklist/calendar:** organize finished MP4s and captions for manual posting without auto-posting infrastructure.
15. **Outcome feedback loop:** optionally log views/retention and compare outcomes by hook, niche and format.

**Recommendation:** prioritize ideas 1–4. Clipflow's core promise is reliable conversion from idea to finished video. Make the first export predictable, keep projects safe, and make offline claims precise before adding cloud collaboration or a large analytics product.
