# Plan: CLIPFLOW Remotion Studio

Date: 2026-09-24  
Spec: [2026-09-24-clipflow-remotion-design.md](../specs/2026-09-24-clipflow-remotion-design.md)  
Goal: Build a local-first studio that prepares mixed-brand batches of 10–20 vertical marketing clips, previews and approves each clip, renders approved clips with Remotion, and exports MP4s, covers and post copy.

## Decisions and boundaries

- Implement the studio as an isolated Next.js 14 App Router app in `remotion-studio/`, using React 18 to align with the existing SaaS app. Bind only to `127.0.0.1:3020` and run the Next server and a separate local worker from `npm run dev`.
- Pin `remotion` and every `@remotion/*` dependency to exactly `4.0.528`. Keep all package versions exact in the app manifest and commit its lockfile.
- Keep all mutable state in ignored `remotion-studio/data`, `remotion-studio/exports`, and `remotion-studio/public/local-assets`. Store app-owned starter brand kits in source files. Seed Clipflow from `brand/branding.md` and MStudio Web from `src/packs/mstudio.json`; let the operator create Sabre's kit without inventing claims, logos, or brand rules.
- Render at 1080×1920, 30 fps, 25-second default and 10–60-second clip duration range. Embed the same composition in the UI through `@remotion/player`; render with `@remotion/renderer` on the worker. Limit rendering to one active clip at a time.
- The v1 visual system uses shared safe-area typography, timed scene layouts, brand colors and logos, with distinct explainer, product-demo, and proof/story compositions. Transition timing and all scene changes derive only from frame and saved props. Avoid introducing generated stock or remote media APIs.
- This first implementation remains local, single-user and manual-posting. Do not add social publishing, scheduling, accounts, cloud rendering, billing, or a general timeline editor.
- Remotion production licensing eligibility remains an operator check before the first production batch; local development and preview work can proceed while that is resolved.

## Interfaces

`src/lib/domain.ts` owns Zod schemas and inferred types. `BrandKit` has schema version, stable ID, display name, palette, heading/body font choices, optional local logo/music paths, tone notes, default CTA, caption styling, approved assets and source/license notes. `ClipBrief` has stable ID, batch ID, brand ID, concept, hook, key message, optional supporting point and proof, CTA, format (`explainer | demo | proof`), duration seconds, editable scene copy, post copy, media overrides and render metadata. `Batch` has stable ID, creation/update timestamps and clip IDs; its status is derived from its clips. Clip state transitions are `draft → needs_review → approved → rendering → rendered | failed`; failed clips can be re-approved for retry. Editing a rendered clip returns it to `needs_review` and preserves its previous output until the next render succeeds.

`src/lib/file-store.ts` provides validated JSON reads and atomic writes beneath an asserted data root. `brand-store.ts` and `batch-store.ts` expose typed CRUD operations and never accept caller-selected filesystem paths. API mutations require a loopback Host and same-origin `Origin`; uploaded files are size-limited, sniffed against allowed image/audio/font formats, randomly named and stored within `public/local-assets`.

`src/lib/scene-plan.ts` maps a saved brief and brand kit into deterministic `CompositionProps` and `SceneSegment[]`. `src/remotion/Root.tsx` registers three compositions with one shared prop schema. `src/lib/render-queue.ts` stores durable single-worker jobs; `src/lib/render-worker.ts` bundles once per worker start, calls `renderMedia()`, extracts a cover frame, updates clip state/progress, and isolates failures. The ZIP contains completed approved outputs only plus post-copy text and a manifest.

## Tasks

### Task 1 — Standalone app shell, storage roots and schemas

Create the isolated Next app, exact-version manifest/lockfile, TS/Vitest configuration, app-local ignore rules, local run scripts and operating README. Add the versioned domain schemas, safe-root filesystem helpers, atomic JSON persistence, and starter brand-kit loader. Derive starter-kit values from the repository sources; mark Sabre as operator-created rather than seeding invented values.

Files: `remotion-studio/package.json`, `package-lock.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.gitignore`, `README.md`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `src/lib/domain.ts`, `src/lib/file-store.ts`, `src/lib/brand-store.ts`, `src/lib/seed-brands.ts`.

Tests: schema accepts valid starter brands and clips and rejects invalid IDs, duration, formats and unsafe media paths; atomic store round-trips data and refuses parent-directory traversal. Run `npm test` and `npm run build` from `remotion-studio/`.

Commit: `feat(remotion): scaffold local studio and validated domain`.

### Task 2 — Brand library and local-only API

Add brand listing, creating and editing, starter-kit seeding, and safe local media upload. Build a practical brand form for palette, logo, font, voice guidance, CTA, approved assets and rights notes. Validate loopback Host and same-origin requests before mutations; enforce a 10 MB asset ceiling, extension/MIME/signature agreement, generated file names and root containment. Prevent deletion of brands referenced by clips.

Files: `app/api/brands/route.ts`, `app/api/brands/[brandId]/route.ts`, `app/api/brands/[brandId]/assets/route.ts`, `src/lib/security.ts`, `src/lib/brand-store.ts`, `app/brands/page.tsx`, `components/BrandEditor.tsx`, `components/BrandLibrary.tsx`.

Tests: local-origin requests pass; foreign origin/Host fail; upload rejects oversized, mismatched and disallowed media and accepts a valid image; update persists and an in-use brand cannot be removed. Run `npm test` and `npm run build`.

Commit: `feat(remotion): add editable brand kits and safe media uploads`.

### Task 3 — Mixed-brand batch entry, CSV import and review workflow

Add batch creation for 10–20 briefs, pasted-row and CSV import with per-row validation feedback, mixed brand assignment and the three format choices. Persist drafts and all edits. Implement state transition functions so API input cannot directly set approval or render status. Build batch list and review workspace with clip cards, script editing, format/duration controls, per-clip approve/unapprove, and batch-level progress. Keep the empty state actionable and explain how to add Sabre from its real brand source.

Files: `src/lib/batch-store.ts`, `src/lib/csv.ts`, `src/lib/clip-state.ts`, `app/api/batches/route.ts`, `app/api/batches/[batchId]/route.ts`, `app/page.tsx`, `app/batches/[batchId]/page.tsx`, `components/BatchCreator.tsx`, `components/BriefImporter.tsx`, `components/ClipReviewGrid.tsx`, `components/ClipEditor.tsx`.

Tests: 10 and 20 clips accepted; 9 and 21 rejected; CSV quoting and bad-row reporting; mixed brands retained; edits invalidate prior approval/output readiness; illegal state transitions rejected; restart reloads saved batches. Run `npm test` and `npm run build`.

Commit: `feat(remotion): create and review mixed-brand clip batches`.

### Task 4 — Shared deterministic motion compositions and live preview

Implement shared composition props, safe areas, kinetic typography, branded backgrounds, optional approved logo/media, scene timing and purposeful transitions. Build distinct animated explainer, product demo and proof/story layouts. Use `TransitionSeries` for transitions and explicit timing math that keeps the entire clip within its selected duration. Mount one selected `@remotion/player` preview with controls and useful phone-size review. Preview frame seeking and rendering read the same saved props and composition registry.

Files: `src/lib/scene-plan.ts`, `src/remotion/Root.tsx`, `src/remotion/entry.ts`, `src/remotion/types.ts`, `src/remotion/shared/SceneFrame.tsx`, `src/remotion/shared/Transition.tsx`, `src/remotion/compositions/Explainer.tsx`, `ProductDemo.tsx`, `ProofStory.tsx`, `app/player/[clipId]/page.tsx`, `components/ClipPlayer.tsx`.

Tests: deterministic props/timing at identical inputs; durations at 10 and 60 seconds; every family mounts and resolves its registered composition; captions remain within configured safe bounds; brand colors/logo propagate; transition boundaries have no negative/overlapping invalid timing. Run `npm test` and `npm run build`.

Commit: `feat(remotion): add three branded motion templates and preview`.

### Task 5 — Durable local render worker and artifact tracking

Add a durable JSON-backed render queue with one active render, restart recovery and per-clip status/progress/error. Provide a separate worker entrypoint and a combined development command. Only explicitly approved clips can enqueue. Bundle the composition once per worker lifecycle, render H.264/AAC MP4 with fast-start settings and deterministic unique output paths, extract a PNG cover at a useful hook frame, and retain old successful artifacts if a replacement render fails. Expose enqueue/status/retry endpoints and a UI progress panel.

Files: `worker.ts`, `src/lib/render-queue.ts`, `src/lib/render-worker.ts`, `src/lib/render-artifacts.ts`, `app/api/batches/[batchId]/render/route.ts`, `app/api/renders/[clipId]/route.ts`, `components/RenderProgress.tsx`, `package.json` scripts.

Tests: unapproved enqueue fails; queue resumes after restart; renders serialize; one simulated failure leaves other queue items running; retry preserves source brief and old artifact until success; render output naming separates duplicate titles across brands; metadata confirms 1080×1920, 30 fps, H.264/AAC MP4. Run unit suite, then renderer smoke tests for all three formats with a short fixture.

Commit: `feat(remotion): render approved clips through durable local queue`.

### Task 6 — Export package, visual quality pass and operating guide

Produce a ZIP for a batch containing each successfully rendered approved clip's MP4, matching cover PNG and post-copy TXT, plus a manifest of brand, format, duration and status. Include a partial batch when some approved clips failed, with failures clearly recorded and no failed/unapproved media labeled ready. Finish coherent empty/loading/error states, media rights guidance, quality checklist and local startup/recovery instructions. Inspect representative frames and finished short clips on a phone-sized viewport; correct clipped captions, unsafe placement, transition collisions, contrast and end-card timing.

Files: `src/lib/export-batch.ts`, `app/api/batches/[batchId]/export/route.ts`, `components/ExportBatchButton.tsx`, `README.md`, motion component/style files as needed.

Tests: ZIP includes exactly successful approved outputs and matching metadata; excludes unapproved, failed and missing artifacts; duplicate display names do not collide; manifest reports each clip's state. Run from `remotion-studio/`: `npm test`, `npm run build`, renderer smoke tests for each family, and `npm run dev` manual flow for 10 mixed-brand clips through review, render and ZIP inspection.

Commit: `feat(remotion): export reviewed clip packages with quality guidance`.

## Completion checks

- `npm test` and `npm run build` pass under `remotion-studio/`.
- Manually complete one mixed-brand batch with 10 clips spanning all three formats, including an operator-created brand, approve selected clips, render, restart the app, then finish/export the batch.
- Play exported MP4s and inspect representative frames for safe-area text, readable captions, coherent pacing/transitions, correct brand application and clean audio behavior.
- Verify the ZIP contains matching videos, cover images, post copy and manifest; confirm unapproved and failed clips are excluded from its deliverables.
- Confirm the README documents the local-only address, startup, restart behavior, media provenance and the Remotion license eligibility check before production rendering.
