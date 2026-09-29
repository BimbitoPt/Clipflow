# Clipflow Preview-First AI Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the original Clipflow PWA into a preview-first, editable five-scene studio with curated local AI backgrounds in both the exported videos and interface.

**Architecture:** Keep the Canvas/WebCodecs renderer and local-only PWA. Add pure script/asset-plan helpers, a bundled AI image manifest, then reorganize the React screen so each scene has a chosen asset used by both preview and export.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, Vitest, Canvas/WebCodecs.

## Global Constraints

- Work in the root PWA (`src/`, port 8081); do not change Remotion Studio.
- Keep 720×1280 MP4 export local, with no account, key, server API, or auto-posting.
- Ship fifteen local AI stills with no baked-in text or logos; keep the existing gradient fallback.
- Keep existing profile localStorage and voice-timing sidecar compatible; ignore sidecar timing when script text is edited.
- Preserve stock and upload choices; uploads remain session-local.
- Use Clipflow black/lime in the interface, but preserve the selected video pack's accent (MStudio blue).

---

### Task 1: Local AI scene library and deterministic matching

**Files:** Create `src/lib/ai-backgrounds.ts`, `src/lib/ai-backgrounds.test.ts`, and fifteen `public/ai-backgrounds/*.png`; modify `vite.config.ts` only if the PWA asset cache needs explicit entries.

**Interfaces:** Export `AiBackground` with `id`, `src`, `label`, `keywords`, `focalY`; export `AI_BACKGROUNDS: AiBackground[]` and `assignAiBackgrounds(idea: string, profile: Profile, cueTexts: string[]): AiBackground[]`.

- [x] Curate the twelve original stills across `clipflow-spine`, `clipflow-series`, and `mstudio-pricing`, then add three MStudio AI-search stills so the blue brand has enough distinct scenes for a five-beat video. Copy them to `public/ai-backgrounds/` with stable descriptive filenames and record paths in the manifest; do not edit the Remotion source assets.
- [x] Write and run a deterministic matching test for five distinct MStudio scenes and existing manifest paths.
- [x] Implement profile-aware keyword scoring with stable tie-breaking; prefer distinct same-brand images for each cue. Test assets/manifest.

### Task 2: Editable script model

**Files:** Create `src/lib/script-draft.ts`, `src/lib/script-draft.test.ts`; modify `src/App.tsx` only to import the helper and hold five text overrides.

**Interfaces:** Export `applyScriptOverrides(base: VideoScript, overrides: Partial<Record<number, string>>): VideoScript` and `hasScriptOverrides(overrides): boolean`.

- [x] Implement and test per-beat overrides, regenerated cue text and social copy, and validation of empty edits.
- [x] Connect overrides to the app; provide restore controls, ignore stale timing on edits, and use edited copy for voice and captions.

### Task 3: Scene asset plan and canvas parity

**Files:** Create `src/lib/scene-assets.ts`, `src/lib/scene-assets.test.ts`; modify `src/App.tsx` and `src/lib/render.ts` only where preview/export asset resolution or scene movement requires it.

**Interfaces:** Export `SceneChoice = { kind: "auto-ai" } | { kind: "ai"; id: string } | { kind: "stock"; src: string } | { kind: "upload"; id: string }` and `ResolvedSceneChoice = { kind: "static"; entry: PoolEntry } | { kind: "upload"; id: string } | { kind: "fallback" }`; export `resolveSceneChoices(choices: SceneChoice[], ai: AiBackground[], stock: PoolEntry[]): ResolvedSceneChoice[]`.

- [x] Implement and test automatic AI, explicit AI, stock, upload, and missing-choice fallback resolution.
- [x] Connect per-scene asset loading and session-local uploads; draw the selected cue midpoint in the preview with the same asset plan used for export.
- [x] Snapshot choices for export, disable editing during export, and report ready/loading/fallback state per scene.

### Task 4: Preview-first interface

**Files:** Create focused components under `src/components/` for `ProfileSettings`, `ScriptBeats`, `SceneTray`, and `ExportPanel`; modify `src/App.tsx` and `src/index.css`.

**Interfaces:** Child components receive values and callbacks; the `App` remains the owner of idea, profile, script overrides, scene choices, preload state, and export state. No new persisted state key is introduced.

- [x] Replace the long page with a preview-first desktop workspace and stacked mobile layout, with idea, collapsible context, and five editable beats.
- [x] Add AI-library/Stock/Upload choices, per-scene thumbnails, a reused library hero image, fallback feedback, focus styles, and reduced-motion handling.
- [x] Move voice, progress, export, and social copy to one panel while keeping the WebCodecs path.
- [x] Smoke-check desktop scene selection, text edit/restore, matching visuals, and export controls.

### Task 5: Verification and merge

**Files:** Tests and docs touched only if verification reveals a specific defect.

- [x] Run `npm test` and `npm run build` at the repository root. Fix failures, rerun affected checks, and run `git diff --check`.
- [ ] Export one short local sample and inspect frames/audio so the chosen AI still in preview is the still in the MP4. Verify no generated text/logos in the image assets and no text obscured by the background.
- [ ] Review the branch diff against the spec, commit any final fixes, fast-forward local `master`, and leave the PWA running at port 8081 for inspection.
