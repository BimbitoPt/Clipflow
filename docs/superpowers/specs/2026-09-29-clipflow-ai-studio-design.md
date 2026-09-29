# Clipflow Preview-First AI Studio — Design

**Date:** 2026-09-29  
**Scope:** The original local-first Clipflow PWA (`src/App.tsx`, port 8081). Remotion Studio is outside this change.

## Outcome

Replace the long profile → idea → script → stock → export page with a preview-first workspace. A creator enters an idea, adjusts the five generated beats, inspects each scene at 9:16, chooses a background per scene, and exports an MP4 with matching imagery and captions. The app stays usable offline after installation and requires no account, API key, or server for generation/export.

## Chosen direction

The user selected the preview-first studio layout over a step wizard and a curated local AI image library over per-idea image generation. The studio keeps Clipflow's black/lime identity. AI stills add depth to the preview, scene tray, and restrained interface hero areas; form surfaces remain solid and readable. AI-generated images contain no text or logos. All copy, captions, and brand marks are drawn by Clipflow.

## Workspace

- A compact top bar explains the four activities: Idea, Script, Visuals, Export. These are anchor points in one workspace, not separate pages.
- The left editing area starts with one clear idea input and an expandable saved profile (niche, audience, offer, tone, proof). The existing localStorage profile remains compatible.
- The script appears as five labeled, editable cards: Hook, Beat 1, Beat 2, Beat 3, CTA. Generated text is the starting point; each field may be restored to its generated value. Edits drive video text, speech input, and post copy. Existing voice-timing sidecar data is ignored when script text differs from the generated text, preventing stale word timings.
- A persistent 9:16 canvas preview shows the selected beat using the same canvas renderer and resolved asset as export. A five-scene strip selects the beat and shows its background choice. On mobile, the preview stacks above the editor with a compact scene strip and no horizontal overflow.
- The visual tray offers **AI library**, **Stock**, and **Upload** per beat. AI library is the default. Existing local stock remains available. Uploads are session-local and clearly labeled. A failed asset falls back to the existing gradient and is reported in the tray without blocking export.
- Export is a focused final action with voice toggle, progress, download, and TikTok/X/LinkedIn copy nearby. The existing 720×1280 WebCodecs/Canvas path remains intact.

## AI image library

- Ship twelve original, dark cinematic stills under `public/ai-backgrounds/`, accompanied by a typed manifest with stable ID, path, short label, keywords, and focal/text-safe metadata. Scenes cover ideas, making, systems, proof, and outcomes without claiming to depict a real product or client.
- Use deterministic matching from idea, profile, cue kind, and cue text to select distinct stills where possible. A stable input produces a stable scene plan; the operator can override each selection.
- Images favor dark, mostly neutral negative space around central copy and caption zones. The Clipflow interface uses lime; finished videos retain the selected pack's accent color (the current MStudio pack is blue). Use subtle push/drift through the existing canvas transform, a dark scrim, and legible text at phone size.
- Generated artwork used in the app chrome comes from this same library; do not introduce a separate visual theme or large image downloads.
- Keep all library assets local and cacheable by the PWA. Missing images preserve a usable gradient preview/export.

## Data and state

- `ScriptDraft` stores five text overrides by cue index. `buildScript()` remains the source for unedited text; a helper creates a coherent `VideoScript` with updated `cues` and social copy when overrides exist.
- `SceneChoice` stores five per-cue choices: automatic AI selection, explicit AI image, stock asset, or uploaded bitmap. These choices live in page state for this release. Existing saved profile and word-timing sidecar keys are unchanged.
- Resolve selected assets once for preview and again from the same `SceneChoice` plan at export start. The export snapshots the plan so edits during a render cannot change later frames. Disable editing while export is running.
- No network image-generation call is made by the PWA. A future optional generator can add images to the same manifest/choice interface without changing the renderer.

## Failure and quality behavior

- Missing/invalid idea keeps script and export disabled with an inline explanation. Empty edited beats are rejected before export.
- Asset load failures show which scene fell back, while preserving all five scenes. Upload decoding failure leaves the prior scene choice intact.
- Voice synthesis and WebCodecs failures keep their existing error paths. Script edits must use the edited text for both voice and captions.
- Check keyboard navigation, focus states, reduced-motion preference for interface transitions, mobile layout at 390px, and contrast over AI imagery.
- Verify scene selection, deterministic asset matching, override/fallback behavior, edited-script propagation, and preview/export asset parity with meaningful tests. Smoke-check a real local preview and export without posting or mutating Remotion Studio batches.

## Boundaries

This change does not add live AI image generation, a cloud account, timeline editing, auto-posting, Remotion rendering, or a new voice model. It preserves the existing local PWA and output format.
