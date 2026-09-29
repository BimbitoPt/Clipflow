# Clipflow Transformation + Proof Motion System

**Date:** 2026-09-29  
**Status:** Approved for spec review  
**Scope:** New videos made by both the browser Clipflow generator (`src/`) and Remotion Studio (`remotion-studio/`). Existing exports and the landing page hero are excluded.

## Outcome

Make Clipflow videos feel specific to their story by animating the transformation from a starting idea or problem to a visible result. Motion should explain what changes and why the result matters. Typography and diagrams support that story; decorative movement does not become the story by itself.

## Narrative grammar

New videos follow a flexible progression:

1. **Starting state:** establish the idea, problem, or input.
2. **Transformation:** reveal the mechanism, steps, or meaningful change.
3. **Evidence or explanation:** show a real approved screen/clip when supplied, or an explanatory diagram when it is not.
4. **Result:** resolve the movement into the output or takeaway.
5. **CTA:** close the sequence with the next action.

These roles map to existing script beats and scene manifests. A video may combine roles or use fewer scenes when its script calls for it; the renderer must not fabricate filler beats to satisfy a fixed template.

## Motion vocabulary

Both renderers use the same named motion intents and equivalent timing semantics, while retaining framework-specific drawing code:

- **Transform:** an input object breaks into or assembles from meaningful parts, then resolves into an output.
- **Sequence:** a connected line, list, or storyboard reveals one step at a time.
- **Comparison:** two states enter and align so a before/after or alternative is immediately readable.
- **Evidence reveal:** a supplied real screen, image, or footage is framed, focused, and annotated without changing its underlying claim.
- **Payoff:** progress, objects, and typography converge on the final outcome and CTA.

Motion should follow voiceover or scene timing where reliable timing exists. Use deterministic frame-based animation so the same inputs produce the same frames. Keep typography inside platform-safe areas and captions clear throughout.

## Renderer behavior

### Browser Clipflow generator

- Preserve the local Canvas/WebCodecs export path and the current preview/export parity.
- Extend its current per-beat background and caption plan with a resolved motion intent and vector composition data.
- Draw diagrams, cards, connectors, callouts, and object reveals on Canvas; use the selected scene image as context rather than relying on it as the sole visual event.
- Allow the creator’s selected/uploaded scene media to act as evidence. If no evidence is supplied, render an explanatory process visual and do not imply it is a real product screen or measured result.

### Remotion Studio

- Extend the creative scene manifest and existing `StoryScene`/`MotionGraphic` path so scene intent drives the visual sequence.
- Favor movement of real footage or approved product screens, with purposeful crop, focus, pointer/callout, panel, and transition animation. Curated stills remain available as scene context.
- Keep manual scene visual and asset overrides. New batches receive the story-led defaults; previously rendered clips and manifests retain their current appearance.

The two renderers keep their own implementation primitives because one is Canvas/WebCodecs and the other is Remotion. Their motion-intent names, intent selection rules, and safe-zone behavior stay aligned without coupling either runtime to the other.

## Asset and claim integrity

- Use real product captures or footage only when they are present and approved for the clip. Do not assume client work is approved for public use.
- Never draw invented analytics, testimonials, interface details, or numerical proof. A decorative process diagram must read as an explanation, not as evidence.
- AI or stock backgrounds can set context but cannot stand in for proof of a product outcome.
- If an asset fails or an intent is unsupported, preserve the scene with its existing background and captions, and use a neutral vector fallback when possible.

## Preview, controls, and data flow

Resolve an intent from the scene role, script content, and available assets when a new clip is composed. Persist that intent with the scene plan/creative manifest so editing, preview, and render use the same selection. Let creators override the visual/asset choice per scene; override state must not change narration or claims implicitly. Export must snapshot the resolved scene plan before rendering, matching the browser generator’s current immutable-export behavior.

## Quality and verification

- Each motion intent has a clear beginning, readable hold, and resolution; no scene depends on motion blur or a rapid cut to communicate its main point.
- The transformation is understandable with audio muted, while timed movement still complements narration when audio is enabled.
- Evidence is visibly distinct from explanatory graphics, and no unsupported result or metric is introduced.
- Preview frames match exported frames for the same plan, assets, and frame time.
- Missing assets and unknown intent values fall back without stopping the entire export.
- Verify intent selection, deterministic timing, safe-area layout, evidence/fallback distinction, manual overrides, error fallback, and preview/export parity in both renderer suites. Render at least one representative transformation clip through each renderer and inspect the full sequence at phone size.

## Out of scope

- Regenerating or replacing existing exports, including the landing-page hero.
- Automatic publishing, batch auto-approval, or public use of unapproved client material.
- Replacing Canvas/WebCodecs or Remotion, adding a new video-generation vendor, or building a general-purpose timeline editor.
- Adding motion to every element in every frame. The motion system should make the story clearer, not busier.
