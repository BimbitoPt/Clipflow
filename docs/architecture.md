# Clipflow Architecture

Authoritative map of the system. Read this before changing any data shape,
pipeline stage, or app boundary. Paths are relative to repo root; `src/`
means the DIY studio unless stated otherwise.

Related: `docs/design-system.md` (UI/render style), `docs/product-design.md`
(why the system looks this way), `README.md` (DIY loop in brief).

## 1. System map

One engine, five doors:

| Area | Stack | Role |
|---|---|---|
| `src/` | React 19 + Vite 7 + Canvas 2D + WebCodecs | DIY single-clip studio. Idea → 45s 720×1280 MP4, fully local. Default door. |
| `shared/` | Pure TypeScript, zero deps | Policy shared by all renderers: captions, visual effects, motion direction. Imported, never copied. |
| `src-tauri/` | Rust (Tauri v2) + bundled FFmpeg | Desktop shell: native file dialogs, `.clipflow` projects, PNG-pipe → H.264 export. |
| `remotion-studio/` | Next.js 14 + Remotion 4 + Kokoro TTS | Batch studio: brands → briefs → queues → multi-scene 1080×1920 compositions with voiceover. |
| `landing/` | Next.js 14 | Marketing site (`:3010`). |
| `saas/` | Next.js + Stripe + SQLite | Billing/SaaS app and Managed pipeline ops. |
| `signal-house-app/` | Laravel + Blade + Vite | Companion portfolio/content app (case-study takes feed the b-roll pool). |
| `scripts/` | Node maintenance scripts | Desktop asset prep, b-roll fetching, icon/capture tooling. |

Data flows one way: profile + idea → script → timing/words → frames →
pixels → MP4 + post copy. No stage talks to a server in the DIY path.

## 2. DIY pipeline (the engine)

Implemented in `src/lib/`, orchestrated by `src/App.tsx` (composition + the
derived-plan memos) over three hooks: `src/hooks/useClipflowProject.ts`
(document + project lifecycle), `src/hooks/useSceneAssets.ts` (media) and
`src/hooks/useExportController.ts` (export lifecycle).

```
idea + profile
  → buildScript (src/lib/script.ts:23) → VideoScript { hook, beats[3], cta, cues[5] }
  → timing: localStorage word-times, exact idea+profile match only (src/lib/session.ts:readWordTiming)
  → words: planWordsTimed | planWords (src/lib/planner.ts:111,161)
  → captions: makeCaptionPlan (shared/caption-plan.ts:36 — memoized in App.tsx, re-planned per export in useExportController)
  → frames: planFrames @30fps (src/lib/planner.ts:11)
  → pixels: drawFrame (src/lib/render.ts:352) + drawMotionGraphic (src/lib/motion-graphics.ts:144)
  → export: browser mp4-muxer (src/lib/browser-export.ts) | desktop FFmpeg pipe
  → post copy: TikTok / X / LinkedIn strings + copy buttons
```

Stage contracts:

1. **Script** — exactly 5 cues (`hook, beat×3, cta`), fixed spans
   `0–4 / 4–16 / 16–28 / 28–40 / 40–45` (`VIDEO_SECS = 45`). Overrides
   (`ScriptOverrides`, `src/lib/script-draft.ts`) invalidate measured
   timing (`App.tsx` timing memo — `hasScriptOverrides` invalidates it). Pack bans (`src/packs/*.json: banned`) apply.
2. **Timing/words** — measured word-times win only on an exact cue/token
   match; otherwise even-split fallback. Every `WordCue` carries
   `cueIndex` so captions survive cue-boundary bleed.
3. **Frames** — `planFrames(script, fps, spans, approvedProofByCue,
   mediaByCue)` returns `{ t, cue, variant, motionIntent, motionLabels,
   progress }`. Variants: hook→`rays`, beats→`blobs/grid/waves`,
   CTA→`pulse`. Motion comes from `shared/motion-direction.ts` via the
   `src/lib/motion-intent.ts` wrapper.
4. **Pixels** — `drawFrame` layer order is fixed: gradient bg → scene
   variant → cover-fit b-roll + dim (`0.55`, `0.16` over real footage) →
   motion graphic → 0.15s edge dip → effect grade → accent bar →
   phrase captions → progress bar. Extra inputs: `{ asset, words,
   captions, visualEffect }`. `drawFrame` must never throw (mock-`DrawCtx`
   tests enforce this).
5. **Export** — browser: capability probes first
   (`probeVideoConfig/probeAudioConfig` — exact shipping configs, named
   failure reasons, desktop app as fallback). Frames draw on the main
   thread (video elements can't cross the boundary) and transfer as
   `VideoFrame`s to `src/lib/export-worker.ts`, which owns
   `VideoEncoder`/`AudioEncoder` + `mp4-muxer` off-thread (AVC `720×1280`
   5 Mbps + AAC 44.1 kHz mono — Chrome refuses AAC at 16 kHz, so the 16 kHz
   model output is upsampled at the browser branch; desktop FFmpeg keeps
   16 kHz — `clipflow-916.mp4`). Backpressure at
   `MAX_QUEUE=24` (resume at 8); yields every 30 frames keep the UI alive;
   abort terminates the worker. The worker ships as its own chunk so
   initial load never pays for export. Opt-in credit (`creditOn`) appends
   `CREDIT_SECS` of `endCard` frames (browser) or `endCardAfter`-flagged
   frames (desktop) — the card replaces the whole frame, no captions.
   Desktop: `renderDesktop`
   (`src/lib/desktop-render.ts`) streams batched raw-RGB24 frames over Tauri raw-binary `invoke`
   to `src-tauri/src/render.rs` (`begin_render/render_frames/prepare_audio
   finish_render/cancel_render`), piped to bundled FFmpeg
   (`-f rawvideo`, `libx264 fast, crf 19, yuv420p, faststart`). Single job at a time
   (`RenderState`), abortable via `AbortController`.

B-roll (`src/lib/broll.ts`): local `STOCK_POOL` with keyword matching
(`tokenizeQuery/matchAsset/assignCueAssets`) and preloading to
`ImageBitmap`/`HTMLVideoElement`. Uploads require explicit proof approval
before export use (`approvedProofByCue`). Upload bytes persist in OPFS
(`src/lib/upload-store.ts`, write-through on upload, rehydrated in
`useSceneAssets.loadSceneAsset`, evicted with the choice or by 30-day GC); the browser
also keeps a `clipflow.session` snapshot so reload restores editor state.
Same-machine durability only — cross-machine upload portability (bytes in
the project file) is explicitly out of scope; desktop native imports are
path-based and already portable that way.

## 3. State model (`src/hooks/*` + `src/App.tsx`)

State is split by responsibility; `App()` only composes:

| Module | Owns |
|---|---|
| `src/hooks/useClipflowProject.ts` | The document: `idea`, profile (`niche/audience/offer/tone/proof`, seeded from `loadInitialProfile`), `packId`, `scriptOverrides`, `sceneChoices[5]` (default `auto-ai`), AI Director takes `planSeeds` + `approvedShots[5]` + hand-edits `planEdits` (all reset on any script-input change; a restore records its input signature in `restoredPlanSigRef` so the post-restore refire settles instead of wiping restored takes), `selectedScene`, `voiceOn`, `captionMode`, `captionOverrides`, `platform`, `creditOn`, `visualEffect`, `queueText`. Project lifecycle: `projectPath/Error/Busy/savedSnapshot/projectBase`, restore/save/open/new/import, browser session snapshot, native close guard, Ctrl+S/O/N. |
| `src/hooks/useSceneAssets.ts` | `sceneAssets` + `assetLoading`, upload/generated OPFS caches and their disposal, scene thumbnails, upload GC, script-driven keyframe generation, Pollinations key. |
| `src/hooks/useExportController.ts` | Export status/progress/message/download URL/voice warning/native output, cancellation (`busyRef` + `AbortController`), and the run itself: capability probes → TTS → per-export caption/window derivation → renderer dispatch. |
| `src/components/PreviewRenderer.tsx` | The live frame: canvas, `planFrames`/`drawFrame` draw effect, first-preview milestone. |
| `src/lib/session.ts` + `src/lib/storage.ts` | Browser persistence behind one injected store (`browserStorage`) — session snapshot (incl. AI Director `planSeeds`/`approvedShots`/`planEdits`, validated with fallbacks that never null the session) and word-timing sidecar. `planInputsSig` is the restore/reset coordination signature (pure, tested). |
| `src/lib/browser-export.ts` | Worker orchestration for the browser MP4 path (backpressure, stall watchdog, credit card). |
| `src/lib/desktop.ts` | DesktopProjectService: native open/save/initial/import/fingerprint + media helpers; native rendering is `src/lib/desktop-render.ts`. |

Derived data (`profile`, `generatedScript`, `script`, `timing`, `words`,
`captions`, `aiSuggestions`) stays in `App()` as `useMemo`, never stored.
The production plan (`buildProductionPlan` + seeded takes +
`applyShotEdits` + `estimatePlanCost`) derives the same way — only the
small `planSeeds`/`approvedShots`/`planEdits` inputs persist (browser
session, `.clipflow` project), so stored bytes can never disagree with
the script.
Hooks receive derived inputs at action time through explicit context objects
(`getSaveContext()`, `ExportContext`) rebuilt on every render, so no action
runs against a stale closure.

Invariants (enforced in `useClipflowProject.restoreProject`/`desktopAction` and `resolveSceneChoices`):

- Exactly 5 cues and 5 scene choices, or throw.
- `timing.windows.length === cues.length`, else the fixed 45s grid.
- `DesktopProjectV1` (`src/lib/desktop.ts:15-29`): `{ version: 1, idea,
  profile, scriptOverrides, sceneChoices, captionMode, captionOverrides,
  voiceOn, visualEffect, timing, savedAt, baseScript?, renderPlan?,
  planSeeds?, approvedShots?, planEdits? }` — plan fields are optional
  (pre-plan files still open) and validated with the session guards (bad
  keys or array → defaults; shot edits degrade per-field, so one corrupt
  duration never discards a valid prompt); restore normalizes them into
  the saved snapshot so old files settle clean, not dirty.
- Plan takes reset on any script-input change (`idea`, profile,
  `scriptOverrides`, `packId`); restores record `planInputsSig` and the
  reset skips while live inputs still match it. Hand-editing a shot
  (`editShot`) unapproves it and drops an override that returns to its
  derived value; `restoreShot` clears every override on one shot (built
  on `setShotEdit`, so the revert rule keeps one home) and unapproves it.
  Both return the same references when nothing changed, so React state
  and the dirty flag stay stable.
  `projectFingerprint` is sorted-key JSON excluding volatile fields —
  it drives the dirty check and script-reuse cache.

## 4. `shared/` — the policy core

Three modules, pure functions, imported by both Canvas and Remotion code:

- `caption-plan.ts` — `CaptionMode = auto|scene|speech|off`,
  `resolveCaptionMode`, `suggestSceneLabel`, `speechPhrases` (≤5-word
  groups, never ending on weak words), `makeCaptionPlan`.
- `visual-effects.ts` — `none|cinematic|mono|vivid|analog` + labels +
  CSS filter strings reused as Canvas `ctx.filter`.
- `motion-direction.ts` — `selectMotionDirection` maps copy + medium +
  proof state to one of 9 intents. Deterministic: same inputs, same
  motion.

Rule: renderer code may wrap these (as `src/lib/motion-intent.ts` does)
but must not fork their logic. `motionLabels` is currently copy-pasted
between `motion-intent.ts` and `StoryScene.tsx` — that duplication is
tech debt; the next edit there should extract a shared helper.

## 5. Desktop (`src-tauri/` + `src/lib/desktop*.ts`)

Tauri v2 app (`pt.mstudioweb.clipflow`): `main.rs` wires 10 commands —
`projects::{save/open/initial/confirm_discard/import_media/
show_in_folder}` and `render::{begin/render_frames/finish/cancel}`.
Window `1440×960`, asset-protocol CSP, NSIS bundle with `ffmpeg.exe`
and `.clipflow` file association (`tauri.conf.json`).

Web/desktop split: `vite.config.ts` switches `publicDir` to
`.desktop-public` under `TAURI_ENV_PLATFORM`; `scripts/prepare-desktop.mjs`
stages FFmpeg, WASM, and referenced b-roll/brand assets there. PWA is
disabled in desktop. `desktop.ts` exposes `isTauri()` gating and all
`invoke` wrappers; every native call has a web fallback or a clear
error — the browser build must never import Tauri APIs unconditionally.

## 6. Batch studio (`remotion-studio/`)

Standalone app (`:3020`): Next.js routes for brands/batches/queues plus
a `worker.ts` render/voiceover pipeline. Domain schemas
(`BrandKit`, `ClipBrief`) are Zod-validated (`src/lib/domain.ts`).
Compositions (`ClipExplainer/ClipProductDemo/ClipProofStory`,
1080×1920@30) share `SceneFrame`/`StoryScene`/`MotionGraphic` primitives
and import the same `shared/` policy as the DIY engine.

Relationship to `src/`: shared policy, separate renderers. Canvas 2D =
single 45s idea→video; Remotion = multi-scene brand/batch output with
Kokoro voiceover, file stores, and durable queues. Converge shared
behavior through `shared/`, never by editing both renderers in parallel.

## 7. Tests, build, packaging

- Root: `vitest run` (35 files in `src/`, `include: src/**/*.test.ts`,
  node env), `tsc --noEmit && vite build`, PWA via `vite-plugin-pwa`.
  Every pipeline stage has a guard (script, planner, words, render
  never-throw, captions, motion intent, broll pool counts, export
  errors, desktop project shape).
- `remotion-studio/`: 21 test files covering domain, queues, voiceover,
  scene planning, caption alignment, composition trees.
- Desktop: `npm run desktop:dev|build` (Windows-only FFmpeg staging).
- B-roll pool-size tests are tripwires: adding pool assets requires
  updating the count test (`src/lib/broll.test.ts`) in the same commit.

## 8. Change conventions

1. Pipeline changes flow downstream: script → timing → frames → pixels
   → export. The production plan derives from the script the same way
   (only takes, approvals and hand-edits persist, never the plan). Update the stage contract (§2) and its tests together.
2. New cross-renderer behavior goes in `shared/` first, then wired into
   both renderers — never renderer-first.
3. Data-shape changes (`VideoScript`, `DesktopProjectV1`, Zod schemas)
   bump validation at every boundary (`restoreProject`,
   `resolveSceneChoices`, schema parsers) in the same commit.
4. No new network calls in the DIY path. Local-first is architectural,
   not cosmetic — see `docs/product-design.md`.
5. Docs follow code: update `architecture.md` (contracts), then
   `design-system.md` (visuals), then `product-design.md` (behavior).
