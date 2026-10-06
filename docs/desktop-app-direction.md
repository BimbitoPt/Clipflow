# Clipflow desktop direction

Status: first Windows desktop prototype implemented and release executable and NSIS installer built. See `docs/native-desktop.md` for the working project, media, and render interfaces. The native window has been observed opening the GT3 RS project with its footage and corrected captions; a complete import/save/export workflow run remains outstanding.

## Starting point

The repository already contains a React/Vite creation UI in `src/`, a Rust CLI/library in `native/`, and a separate Next.js/Remotion batch studio. The Rust renderer supports local FFmpeg execution and local voice synthesis, but its script/caption/render plans currently differ from the browser's. A desktop shell alone would preserve those differences and would not solve media management, rendering reliability, or project persistence.

## Recommended first release

Build a Windows desktop app with Tauri 2, the existing React UI, and a Rust application service. Tauri connects a web frontend to a native Rust core and uses the platform webview. Reuse `native/` rendering utilities, after adding a versioned render-job interface that consumes the actual edited scene plan rather than generating another script from the idea. Keep Remotion as a later renderer adapter rather than embedding the entire Next.js server in the first release.

Sources: https://v2.tauri.app/concept/architecture/ and https://v2.tauri.app/concept/process-model/

## First useful milestone

1. Launch an installed Clipflow window containing the existing creation UI; no manually started localhost server.
2. Import media with a native file picker or drag and drop. Copy assets into a project media directory and store stable asset IDs and paths.
3. Save and reopen a project folder containing a versioned manifest: script, scene boundaries, media assignments, source notes, motion plan, caption mode, separate scene labels, audio choices, and brand settings.
4. Select an export destination through the native save dialog. Enqueue a native render job, show progress, support cancellation, and show the output in Explorer. Jobs write to a temporary output before renaming a completed MP4.
5. Render exactly the chosen footage and edited captions. Match representative preview frames to native frames; do not use the Rust CLI's independent default script as a hidden fallback.

## Boundaries

Frontend: editing, media thumbnails, preview, caption controls, job progress.

Rust core: project storage, media metadata/probing, waveform/thumbnail generation, render job lifecycle, file access and native dialogs. Commands accept validated structured jobs and asset IDs rather than arbitrary shell commands. Heavy work runs outside the UI thread.

Renderer adapter: inputs are a versioned manifest and resolved media paths; outputs are an MP4, diagnostics, and progress/cancellation events. Native FFmpeg is the first adapter. The Remotion adapter must later receive the same scene/caption decisions rather than re-plan the story.

## Caption contract

Scene labels are short independently editable text and never pretend to be speech subtitles. Speech captions use complete timed phrases, retain negation, respect scene/phrase boundaries, and disappear when their timing ends. Timing provenance is stored as measured or estimated. Native ASS captions and browser Canvas captions share the same phrase plan and safe areas.

## Order of work

First: define the saved-project/render-job contract and migrate Rust to consume it.

Second: add the Tauri shell, native import/save dialogs and project persistence.

Third: connect native render jobs and cancellation, package a Windows installer, and compare rendered footage/caption frames against preview.

Then: music mixing, waveform timeline, background render queue, desktop batch tools, and a Remotion adapter. macOS follows a working Windows milestone with its own packaged renderer/model dependencies.

## Completion criteria

A saved project can be closed, reopened, and exported with its exact imported media and edited labels. Cancelling a render leaves the UI responsive and preserves the project. A failed asset or encoder reports a useful error rather than replacing selected footage. The installer opens without requiring a terminal or development server. The installed renderer and preview agree on scene timing and caption text.
