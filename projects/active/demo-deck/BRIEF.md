# BRIEF — Demo Deck (America.gov-style code-driven demos)

## Goal
Build America.gov-style launch demos into Clipflow: keynote slides authored
in code (React + Remotion, design-system components), presented live in the
browser with arrow-key reversible transitions at presenter pace, sharing one
set of motion tokens for timing/easing, and exportable as MP4s.

## Acceptance criteria
- [ ] `shared/motion-tokens.ts`: durations, spring configs, transition timings, stagger — one source for player + export
- [ ] Deck model + pure reducer: slides → build steps, next/prev/goto fully reversible (any step reachable both directions)
- [ ] `DeckPlayer`: @remotion/Player + ArrowRight/Left/Space stepping, presenter pace (manual advance, optional auto), progress indicator
- [ ] MP4 export of the deck via the existing render-worker `renderMedia` path (composition registered in Root)
- [ ] Sample Clipflow launch deck demonstrating the system
- [ ] 1–2 existing scattered springs migrated to tokens (no behavior change)
- [ ] Unit tests: reducer reversibility/edges, token invariants, deck frame math
- [ ] Full suite green + `tsc` clean in both workspaces

## Scope
In: tokens, deck model/player/composition, export wiring, sample deck, tests.
Out: editing UI for decks (JSON/TS authored), presenter notes view, remote clicker.

## References
- `remotion-studio/src/remotion/shared/MotionTransition.tsx` — current transitions
- `remotion-studio/src/remotion/shared/SceneFrame.tsx`, `StoryScene.tsx`, `MotionGraphic.tsx` — scattered spring configs to unify
- `remotion-studio/components/ClipPlayer.tsx` — Player usage pattern
- `remotion-studio/src/lib/render-worker.ts:47` — renderMedia path to reuse
- `remotion-studio/src/remotion/Root.tsx` — composition registration
- `shared/motion-direction.ts` — pure editorial policy (unchanged)
