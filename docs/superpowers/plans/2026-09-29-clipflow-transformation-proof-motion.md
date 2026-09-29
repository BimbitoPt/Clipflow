# Clipflow Transformation + Proof Motion System Implementation Plan

> **For agentic workers:** Implement inline from this plan. Keep changes to the two renderers and their scene controls; preserve existing user workspace changes.

**Goal:** Make new browser-generated and Remotion Studio clips tell a visible input-to-result story using purposeful, deterministic motion graphics and real approved proof assets when available.

**Architecture:** Each renderer resolves scene copy and available media into the same five named motion intents: `transform`, `sequence`, `comparison`, `evidence-reveal`, and `payoff`. Canvas/WebCodecs and Remotion keep separate drawing implementations, but follow the same intent and safe-area rules. Motion intent and asset choice are resolved once per scene and reused by preview and export.

**Tech Stack:** TypeScript, React, Canvas 2D, WebCodecs, Next.js, Remotion, Zod.

## Global Constraints

- Animate the transformation from an idea or problem to a visible result; motion should explain what changes and why it matters.
- Use real product captures or footage only when present and approved for the clip. Do not assume client work is approved for public use.
- Never draw invented analytics, testimonials, interface details, or numerical proof.
- AI or stock backgrounds can set context but cannot stand in for proof of a product outcome.
- Use deterministic frame-based animation and preserve preview/export parity.
- Keep captions clear and typography inside platform-safe areas.
- If an asset fails or an intent is unsupported, preserve the scene with its existing background and captions, using a neutral vector fallback when possible.
- Existing exports and the landing-page hero keep their current appearance; new clips receive the motion system.
- Scenes without a persisted motion intent are legacy scenes and keep their existing treatment; explicit `auto` opts a scene into new automatic intent resolution.
- The Canvas/WebCodecs renderer and Remotion keep independent drawing primitives; align their intent names and selection semantics without coupling their runtimes.

---

## File Map

### Browser Clipflow generator

- `src/lib/motion-intent.ts` — named intents and deterministic cue-to-intent resolution.
- `src/lib/motion-graphics.ts` — Canvas vector compositions for each intent, driven only by normalized scene progress.
- `src/lib/planner.ts` — attach one resolved intent and normalized progress to each planned frame.
- `src/lib/scene-assets.ts` — explicit proof approval state for uploaded media.
- `src/components/SceneTray.tsx` — let a creator mark an uploaded visual as approved proof.
- `src/App.tsx` — pass the same proof/media plan to preview and export.
- `src/lib/render.ts` — draw the resolved motion graphic before captions with safe primitive fallbacks.

### Remotion Studio

- `remotion-studio/src/lib/domain.ts` — persist backwards-compatible scene motion intent and proof approval.
- `remotion-studio/src/lib/scene-plan.ts` — resolve `auto` intents into concrete scene roles.
- `remotion-studio/src/lib/creative-defaults.ts` — assign story-led defaults for new clips.
- `remotion-studio/src/remotion/shared/MotionGraphic.tsx` — render deterministic intent-specific vector animations.
- `remotion-studio/src/remotion/shared/StoryScene.tsx` — compose title, approved screen/media, graphics, and captions according to the resolved intent.
- `remotion-studio/components/ClipEditor.tsx` — expose per-scene motion intent and proof approval controls.
- `remotion-studio/app/api/batches/[batchId]/clips/[clipId]/route.ts` — validate scene intent overrides at the existing edit boundary.
- `remotion-studio/src/lib/clip-state.ts` — persist scene intent edits and invalidate stale renders as required.

## Task 1: Add scene intent and explicit proof marking to browser Clipflow

**Files:** create `src/lib/motion-intent.ts`; modify `src/lib/planner.ts`, `src/lib/scene-assets.ts`, `src/components/SceneTray.tsx`, and `src/App.tsx`.

**Interfaces:**

```ts
export type MotionIntent =
  | "transform"
  | "sequence"
  | "comparison"
  | "evidence-reveal"
  | "payoff";

export function resolveMotionIntent(input: {
  cue: TimedCue;
  cueIndex: number;
  approvedProof: boolean;
}): MotionIntent;
```

- [ ] Add `MotionIntent` and a pure resolver. Hooks resolve to `transform`, CTAs to `payoff`, explicitly approved uploads to `evidence-reveal`, explicit before/after or comparison language to `comparison`, and step/process language to `sequence`. Remaining beats use stable positional defaults of `transform`, `sequence`, then `comparison`.
- [ ] Add an optional `approvedProof` flag to the upload choice. Existing choices remain context media by default. Only an uploaded image explicitly marked as approved proof can resolve to `evidence-reveal`; AI library and stock selections never become proof automatically.
- [ ] In `SceneTray`, show the approval checkbox only for the active uploaded image. Toggling it updates the selected `SceneChoice` without losing the upload ID. Explain that the media is then treated as proof in this clip.
- [ ] Extend `planFrames(script, fps, spans, approvedProofByCue?)` without changing current callers that omit the fourth argument. For each frame, add `motionIntent` and `progress`, where `progress = clamp((t - cueStart) / (cueEnd - cueStart), 0, 1)` and cue bounds use measured voice spans when valid.
- [ ] Update both `planFrames` calls in `src/App.tsx` to pass the same five-scene proof-approval snapshot. Keep frame plans immutable once an export starts.

## Task 2: Draw deterministic motion graphics in the browser renderer

**Files:** create `src/lib/motion-graphics.ts`; modify `src/lib/render.ts`.

**Interfaces:**

```ts
export function drawMotionGraphic(
  ctx: DrawCtx,
  intent: MotionIntent,
  progress: number,
  width: number,
  height: number,
  accent: string,
): void;
```

- [ ] Add `drawMotionGraphic` with a switch for all five intents. Use Canvas geometry: input/output tiles and connecting morph for `transform`; progressively traced steps for `sequence`; aligned states for `comparison`; an image-frame focus bracket and restrained pointer for `evidence-reveal`; converging progress marks for `payoff`.
- [ ] Clamp progress in the drawing module. Use frame-derived values only; do not call `Date.now`, random number generators, or read mutable UI state while drawing.
- [ ] Extend the optional `DrawCtx` primitives only as required. Guard each optional primitive and restore alpha/style state after drawing so an incomplete test or browser context falls back without throwing.
- [ ] Call the graphic after background/scene media and before speech captions. Keep the main caption block clear by using top and lower visual zones; never cover the caption center or bottom progress bar.
- [ ] Retain the selected scene media’s existing cover-fit and slow camera movement. The motion graphic supplements the image instead of replacing it.

## Task 3: Carry motion intent through Remotion manifests and render scenes

**Files:** modify `remotion-studio/src/lib/domain.ts`, `remotion-studio/src/lib/scene-plan.ts`, `remotion-studio/src/lib/creative-defaults.ts`, `remotion-studio/src/remotion/shared/MotionGraphic.tsx`, and `remotion-studio/src/remotion/shared/StoryScene.tsx`.

**Interfaces:**

```ts
export type MotionIntent =
  | "auto"
  | "transform"
  | "sequence"
  | "comparison"
  | "evidence-reveal"
  | "payoff";
```

- [ ] Add optional `motionIntent` and `evidenceApproved` fields to each Zod creative scene. `motionIntent` accepts `auto` and the five concrete intents; `evidenceApproved` defaults to `false`. Keep both optional/defaulted so previously saved batch JSON parses unchanged.
- [ ] Add optional resolved `motionIntent` to `SceneSegment`. Preserve `undefined` for legacy scenes whose manifest has no intent. Resolve `auto` deterministically from scene role and available assets: opening to `transform`, middle process beats to `sequence` or `comparison`, a supplied `scene.screen` with `evidenceApproved === true` to `evidence-reveal`, and the final scene to `payoff`. Never resolve generated backgrounds or an unapproved screen to `evidence-reveal`.
- [ ] Assign explicit story-led intents in `defaultCreativeTreatment` for newly created clips. Avoid forcing evidence intent when the scene has no real screen/media; use a process or comparison graphic instead.
- [ ] Extend `MotionGraphic` with intent-driven step tracing, state comparison, proof-screen focus/callout, and payoff convergence. Derive every value from `useCurrentFrame`, scene duration, and `fps` so Remotion renders are deterministic.
- [ ] Update `StoryScene` to compose the resolved graphic with the existing display title, screen, scene visual, background, and captions. Only approved screens receive evidence-specific callouts or proof labels; an unapproved screen can still appear as context. Preserve brand colors, existing source labels, 9:16 safe zones, legacy `motionGraphic` manifests, and transition behavior.

## Task 4: Add per-scene Remotion intent controls

**Files:** modify `remotion-studio/components/ClipEditor.tsx`, `remotion-studio/app/api/batches/[batchId]/clips/[clipId]/route.ts`, and `remotion-studio/src/lib/clip-state.ts`.

**Interface:** the edit payload includes `sceneMotionIntents: Array<MotionIntent | null>` and `sceneEvidenceApprovals: boolean[]`, with one entry per scene; `null` preserves a legacy scene with no intent, while `auto` clears a concrete override and opts into deterministic resolution.

- [ ] Add one intent selector to each scene in the Visuals tab: Existing treatment, Auto story motion, Transform, Sequence, Comparison, Evidence reveal, and Payoff. Show the resolved scene intent next to the selector so the preview communicates the effect of the override. Add an “Approved for use as evidence” checkbox only when the scene has a screen asset; disable Evidence reveal until approved.
- [ ] Include `sceneMotionIntents` and `sceneEvidenceApprovals` in `editPayload` and in the route’s strict Zod patch schema. Validate one nullable intent and one approval flag per scene; reject invalid values or mismatched scene counts with the route’s existing 400 error path.
- [ ] Extend `ClipEdit` and `editClip` to update only `creative.scenes[*].motionIntent` and `evidenceApproved`, preserving other scene data. Map `null` to no persisted intent and `auto` to deterministic resolution. Existing rendered outputs must be invalidated when a visual intent or evidence-approval value changes, and edited clips return to `needs_review` as they do for other edits.
- [ ] Keep batch review and approval explicit. Saving an intent edit must never approve, render, or publish a clip automatically.

## Task 5: Complete the cross-renderer behavior

**Files:** review the Task 1–4 changes; adjust only the files listed in those tasks if integration requires it.

- [ ] Confirm browser preview and export use identical `PlannedFrame` intent/progress and upload-proof snapshots.
- [ ] Confirm Remotion Player and render worker use the same `buildCompositionProps`/`makeScenePlan` resolution.
- [ ] Confirm old `creative` manifests without `motionIntent`, old browser frame inputs without motion fields, missing assets, and unsupported drawing primitives all preserve the current scene rather than throwing.
- [ ] Run TypeScript/build checks for the root app and Remotion Studio. Do not add or run test suites as part of this request.
- [ ] Render one representative new clip in each renderer only if the user later asks for rendered examples or verification; do not modify or regenerate existing exports during implementation.

## Completion Criteria

- New videos from both renderers resolve scene-specific story motion instead of reusing only background drift, caption changes, and generic entrances.
- Browser creators can explicitly mark an uploaded scene image as approved proof; default images remain contextual visuals.
- Remotion creators can override the motion intent scene by scene and see the selected treatment in preview.
- The proof treatment uses real supplied media only; missing proof uses a clearly explanatory visual.
- Preview/render paths remain deterministic and caption-safe; legacy content remains compatible.
- No existing landing hero, rendered clip, batch approval, or publishing state is changed.
