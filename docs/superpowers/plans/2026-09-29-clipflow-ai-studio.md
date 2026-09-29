# Clipflow Preview-First AI Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the original Clipflow PWA into a preview-first, editable five-scene studio with curated local AI backgrounds in both the exported videos and interface.

**Architecture:** Keep the Canvas/WebCodecs renderer and local-only PWA. Add pure script/asset-plan helpers, a bundled AI image manifest, then reorganize the React screen so each scene has a chosen asset used by both preview and export.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, Vitest, Canvas/WebCodecs.

## Global Constraints

- Work in the root PWA (`src/`, port 8081); do not change Remotion Studio.
- Keep 720×1280 MP4 export local, with no account, key, server API, or auto-posting.
- Ship twelve local AI stills with no baked-in text or logos; keep the existing gradient fallback.
- Keep existing profile localStorage and voice-timing sidecar compatible; ignore sidecar timing when script text is edited.
- Preserve stock and upload choices; uploads remain session-local.
- Use Clipflow black/lime in the interface, but preserve the selected video pack's accent (MStudio blue).

---

### Task 1: Local AI scene library and deterministic matching

**Files:** Create `src/lib/ai-backgrounds.ts`, `src/lib/ai-backgrounds.test.ts`, and twelve `public/ai-backgrounds/*.png`; modify `vite.config.ts` only if the PWA asset cache needs explicit entries.

**Interfaces:** Export `AiBackground` with `id`, `src`, `label`, `keywords`, `focalY`; export `AI_BACKGROUNDS: AiBackground[]` and `assignAiBackgrounds(idea: string, profile: Profile, cueTexts: string[]): AiBackground[]`.

- [ ] Curate twelve existing original AI stills from `remotion-studio/public/scene-backgrounds/`: four each from `clipflow-spine`, `clipflow-series`, and `mstudio-pricing`. These already use the approved 9:16 cinematic, text-free style. Copy them to `public/ai-backgrounds/` with stable descriptive filenames and record paths in the manifest; do not edit the Remotion source assets.
- [ ] Write a failing test that calls `assignAiBackgrounds` twice with the same idea/profile/cues and expects the same five IDs, five distinct IDs, and existing manifest paths. Run `npx vitest run src/lib/ai-backgrounds.test.ts` and confirm failure.
- [ ] Implement a pure keyword scorer with stable tie-breaking by manifest order; diversify by excluding already selected IDs until the library is exhausted. Return one entry per cue. Run the focused test and commit assets/manifest.

### Task 2: Editable script model

**Files:** Create `src/lib/script-draft.ts`, `src/lib/script-draft.test.ts`; modify `src/App.tsx` only to import the helper and hold five text overrides.

**Interfaces:** Export `applyScriptOverrides(base: VideoScript, overrides: Partial<Record<number, string>>): VideoScript` and `hasScriptOverrides(overrides): boolean`.

- [ ] Write a failing test that overrides Hook and Beat 2, asserts all five `cues[].text` match `hook/beats/cta`, verifies social copy uses edited text, and confirms the base script is unchanged. Run `npx vitest run src/lib/script-draft.test.ts` and confirm failure.
- [ ] Implement `applyScriptOverrides` with trimmed nonempty fields, copied cue timings/kinds, and rebuilt LinkedIn body; reject empty edited text. Use generated text for unedited slots. Run the focused test and commit.
- [ ] In the app, store per-index overrides and expose “restore generated” per beat. Use the timing sidecar only while `hasScriptOverrides` is false. Keep edited text in TTS input and captions.

### Task 3: Scene asset plan and canvas parity

**Files:** Create `src/lib/scene-assets.ts`, `src/lib/scene-assets.test.ts`; modify `src/App.tsx` and `src/lib/render.ts` only where preview/export asset resolution or scene movement requires it.

**Interfaces:** Export `SceneChoice = { kind: "auto-ai" } | { kind: "ai"; id: string } | { kind: "stock"; src: string } | { kind: "upload"; id: string }` and `ResolvedSceneChoice = { kind: "static"; entry: PoolEntry } | { kind: "upload"; id: string } | { kind: "fallback" }`; export `resolveSceneChoices(choices: SceneChoice[], ai: AiBackground[], stock: PoolEntry[]): ResolvedSceneChoice[]`.

- [ ] Write a failing test for automatic AI, explicit AI, stock, upload ID, and missing image choice. Missing IDs/paths must resolve to `{kind:"fallback"}` for the gradient. Run `npx vitest run src/lib/scene-assets.test.ts` and confirm failure.
- [ ] Implement the resolver and an app-level preload map keyed by scene index. Resolve upload IDs against session-local `ImageBitmap`s. Preview selected scene at its cue midpoint, using the same resolved asset selected for export. Preserve cover-fit, dark scrim, and subtle push in `drawFrame`.
- [ ] Freeze the five choices and preloaded assets when export begins; disable scene/script edits until completion. Show per-scene load/fallback state. Run focused tests and commit.

### Task 4: Preview-first interface

**Files:** Create focused components under `src/components/` for `ProfileSettings`, `ScriptBeats`, `SceneTray`, and `ExportPanel`; modify `src/App.tsx` and `src/index.css`.

**Interfaces:** Child components receive values and callbacks; the `App` remains the owner of idea, profile, script overrides, scene choices, preload state, and export state. No new persisted state key is introduced.

- [ ] Replace the long vertical page with desktop edit/preview/scene columns and a mobile stacked view. Show the idea first, keep profile settings collapsible, and put five editable beats beside the selected preview.
- [ ] Add AI-library/Stock/Upload choices per selected scene with accessible labels, thumbnails, and an explicit fallback message. Reuse library imagery sparingly in the interface hero; maintain opaque controls and clear focus states.
- [ ] Move voice toggle, progress, MP4 download action, and TikTok/X/LinkedIn copy into one export panel. Keep all existing export behavior. Add reduced-motion handling for UI transitions.
- [ ] Smoke-check at desktop and 390px in the browser: scene selection, text edit/restore, image selection, stock/upload fallback, export controls. Commit.

### Task 5: Verification and merge

**Files:** Tests and docs touched only if verification reveals a specific defect.

- [ ] Run `npm test` and `npm run build` at the repository root. Fix failures, rerun affected checks, and run `git diff --check`.
- [ ] Export one short local sample and inspect frames/audio so the chosen AI still in preview is the still in the MP4. Verify no generated text/logos in the image assets and no text obscured by the background.
- [ ] Review the branch diff against the spec, commit any final fixes, fast-forward local `master`, and leave the PWA running at port 8081 for inspection.
