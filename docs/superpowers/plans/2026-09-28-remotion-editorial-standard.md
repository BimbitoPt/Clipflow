# Remotion Editorial Standard Implementation Plan

**Goal:** Make the approved cinematic treatment the default for new clips and produce one source-backed trend video for Clipflow and MStudio.

**Architecture:** Extend creative manifests with a reusable storyboard treatment and optional scene visual data. Batch creation supplies branded defaults; a topic production script appends the two researched clips, synthesizes and normalizes narration, aligns captions, and queues the existing render worker.

**Tech Stack:** Next.js, TypeScript, Zod, Remotion, Kokoro, FFmpeg, Vitest.

## Global constraints

- Preserve existing rendered clips and the four-scene featured treatments.
- Keep new copy and captions inside vertical social safe zones.
- Use only primary sources for trend claims and put their URLs in the clip metadata and post copy.
- Generate images without text; add all letters and diagrams in Remotion.
- Keep the 10–20 clip batch workflow and explicit review/render states.

### Task 1: Generalize the approved treatment

- [x] Extend `remotion-studio/src/lib/domain.ts` with `cinematic-story`, optional scene visuals, and source metadata.
- [x] Build storyboard defaults in `src/lib/creative-defaults.ts`; assign them in `createBatch` and `appendClips`.
- [x] Render storyboard headlines and step/card visuals in `StoryScene.tsx` using the manifest, while retaining legacy featured templates.
- [x] Add phrase caption timing after generated voiceover and safe audio defaults; verify with focused tests.

### Task 2: Produce two source-backed clips

- [x] Save the eight approved generated stills under `public/scene-backgrounds/`.
- [x] Add a production script with verified claims, scripts, captions, source URLs, and visual beats.
- [x] Append one Clipflow and one MStudio clip to the existing batch, synthesize narration, normalize near −14 LUFS, and render both.
- [x] Inspect the scene frames and audio, then export and verify a 12-clip ZIP.

### Task 3: Verify and deliver

- [x] Run Vitest, TypeScript, production build, and `git diff --check`.
- [x] Commit the implementation and provide video and export paths with primary-source citations.
