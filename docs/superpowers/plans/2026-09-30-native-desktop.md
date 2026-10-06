# Clipflow Native Desktop Implementation Plan

> **For agentic workers:** Execute this plan inline with checkpoints using the executing-plans skill.

**Goal:** Deliver a Windows Clipflow executable and installer with project persistence, native media import, and cancellable local MP4 export.

**Architecture:** Tauri 2 hosts the existing React editor. Rust owns project files, imported media and FFmpeg jobs. The shared Canvas renderer supplies final frames to FFmpeg so native output consumes the exact edited scene, motion and caption plan.

**Tech Stack:** React, Vite, TypeScript, Tauri 2, Rust, bundled FFmpeg, Windows WebView2.

## Global constraints

- Preserve current browser workflows and existing uncommitted work.
- Windows first, no manual development server in the packaged app.
- Project schema version 1 records edited scripts, caption overrides, media choices, profile, voice and timing provenance.
- Copy imported media into project assets; reject missing selected media during export.
- Render one job at a time with progress and cancellation. Finalize temporary output only on successful completion.
- Do not add or run tests unless requested; compilation and packaging are necessary build steps.

### Task 1: Native shell and packaging

- [x] Add src-tauri Cargo/build/config/capability files and desktop npm commands.
- [x] Bundle FFmpeg from ffmpeg-static with a preparation script.
- [x] Compile a Windows release executable and NSIS installer with the built Vite assets.

### Task 2: Projects and native media

- [x] Define DesktopProjectV1 in src/lib/desktop.ts.
- [x] Add native open/save/import commands in src-tauri/src/projects.rs.
- [x] Add a desktop toolbar for new/open/save/import, project title and error reporting.
- [x] Integrate native media choices in the current scene loader; save immutable copies beside the project manifest.

### Task 3: Exact-frame native render

- [x] Add begin/frame/finish/cancel render commands with a managed FFmpeg child process and temporary file cleanup.
- [x] Implement src/lib/desktop-render.ts using drawFrame and the existing scene/caption/frame plans.
- [x] Route desktop export through the native renderer, show progress/cancel and completed output path.
- [x] Package and launch the resulting native executable.

### Task 4: Delivery

- [x] Document native development, packaging, project format and remaining platform limitations.
- [x] Provide links to the actual executable and installer and report build results.
