# Remotion Voiceover and Motion Implementation Plan

**Goal:** Add local generated narration, synchronized caption highlighting, brand-aware music ducking, and selectable motion styles to CLIPFLOW Remotion clips.

**Architecture:** Extend the saved clip brief with editable narration, generated local audio, timing metadata, and a validated motion preset. Synthesize with the existing SpeechT5 model stored in the repository, save WAV assets below the Remotion public asset directory, and feed audio/timing through the shared composition props used by both preview and render. Keep the existing review-before-render/export flow.

**Tech Stack:** Next.js 14, React 18, TypeScript, Remotion 4.0.528, Transformers.js 2.17.2, Vitest.

## Global Constraints

- Local-first synthesis uses only the repository's existing SpeechT5 ONNX weights and speaker embedding.
- Generated audio and derived assets remain ignored local files under `remotion-studio/public/local-assets`.
- Existing batches remain readable through defaults for the new optional fields.
- Voiceover generation never auto-approves, renders, exports, or publishes a clip.
- Preserve exact 1080×1920, 30 fps render settings and the existing brand-approved soundtrack behavior.

### Task 1: Data contract and local speech service

**Files:** `remotion-studio/src/lib/domain.ts`, `remotion-studio/src/lib/voiceover.ts`, `remotion-studio/src/lib/voiceover.test.ts`, `remotion-studio/app/api/batches/[batchId]/clips/[clipId]/voiceover/route.ts`.

- [x] Add optional narration script, safe audio path, word intervals, and motion enum with backward-compatible defaults.
- [x] Add a cached SpeechT5 server pipeline pointed at `../public/models`, PCM WAV encoding, and bounded script validation.
- [x] Add a local POST route that writes a generated WAV under `public/local-assets/voiceovers` and updates only that clip's narration data.
- [x] Test word interval coverage, path safety, WAV metadata, and route-independent service helpers.

### Task 2: Shared audio and caption playback

**Files:** `remotion-studio/src/lib/scene-plan.ts`, `remotion-studio/src/remotion/shared/WithSoundtrack.tsx`, `remotion-studio/src/remotion/shared/SceneFrame.tsx`, `remotion-studio/components/ClipPlayer.tsx`.

- [x] Carry voiceover intervals through composition props and play voiceover in Player and rendered composition.
- [x] Duck an approved music track while narration is active and retain the existing music level when narration is absent.
- [x] Render active-word captions from saved timing; preserve the current animated text treatment when voiceover is absent.
- [x] Add tested motion presets for kinetic, float, and punch scenes using bounded transforms and opacity.

### Task 3: Review controls and API integration

**Files:** `remotion-studio/components/ClipEditor.tsx`, `remotion-studio/app/api/batches/[batchId]/clips/[clipId]/route.ts`, `remotion-studio/src/lib/batch-store.ts`, `remotion-studio/src/lib/scene-plan.test.ts`.

- [x] Expose editable narration, generate/regenerate voiceover, and motion style selection in clip review.
- [x] Clear stale generated audio when saved narration text changes; keep the clip in review state.
- [x] Ensure the generation route only accepts local same-origin requests and clip IDs already belonging to the batch.
- [x] Test editing, narration invalidation, and generated timing in composition props.

### Task 4: Verification and operator docs

**Files:** `remotion-studio/README.md`, relevant tests above.

- [x] Run the full studio test suite and production build.
- [x] Smoke-check the existing approved voice model loads offline and one generated WAV has valid PCM duration.
- [x] Document first-run model availability, narration editing/regeneration, caption timing limits, motion presets, and the unchanged approval/export gate.

### Batch-scale narration follow-up

**Files:** `remotion-studio/app/api/batches/[batchId]/voiceovers/route.ts`, `remotion-studio/components/BatchWorkspace.tsx`, `remotion-studio/src/lib/voiceover-script.ts`.

- [x] Generate only missing tracks sequentially from each clip's distinct hook, message, support, proof and CTA; preserve per-clip review status and return generated/skipped/failed counts.
- [x] Add a batch-level progress and completion message so a 10–20 clip production batch can be narrated in one action.
- [x] Persist batch narration jobs in the local queue; let the dedicated worker synthesize outside the web process, report per-clip progress, and recover interrupted jobs.

### Review hardening

- [x] Fail stale queued or running narration jobs with a retryable message instead of polling indefinitely.
- [x] Lock clip editing while one-off speech synthesis runs so refreshed server data cannot overwrite in-progress edits.
- [x] Keep the timing schema consistent with the maximum 900-character narration script, including its worst-case word count.
- [x] Re-run all tests, production build, and a browser check of the populated mixed-brand review batch.
