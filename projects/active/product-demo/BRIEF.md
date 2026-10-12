# BRIEF — Product Demo (video + deck centerpiece)

## Goal
A Clipflow product demo in both forms, combined: a demo video rendered by
Clipflow's own native engine (dogfood), embedded as the centerpiece slide of
the launch deck from the demo-deck project.

## Acceptance criteria (v2 — research-driven)
- [x] Research doc `docs/demo-craft-research.md` (13 sources, playbook)
- [x] Native plans: `--plan short` (45s) / `--plan master` (75s skeleton)
- [x] Pack copy rewritten to converting beats (proof = own render, objection, held CTA)
- [x] Both cuts rendered with SAPI VO (short 41s, master 57s VO-timed) and verified
- [x] Deck centerpiece refreshed (short cut still fits the 1260f hold)
- [x] Native tests green (35 lib + integration; tts_fixture fails = missing SpeechT5 weights, pre-existing/environmental)

## Acceptance criteria (v1 — done)
- [x] Native `clipflow` pack (`native/packs/clipflow.json`, `--pack clipflow`)
- [x] Demo video rendered via native CLI with SAPI voiceover + ASS captions
- [x] Deck supports video slides (`media` on `DeckSlide`, Remotion `<Video>`)
- [x] Sample launch deck gains a "watch it work" centerpiece slide
- [x] Deck export re-verified with the video slide (frames checked)
- [x] Native + studio tests green (excluding known pre-existing failure)

## Scope
In: native pack + gate, CLI render, deck media support, sample slide, verify.
Out: editing UI, new b-roll assets (use the rated pool as-is).

## References
- `native/src/script.rs:82` — baked mstudio pack (parameterize)
- `native/src/main.rs:368` — pack gate (widen)
- `native/README.md` — CLI flags (`--voice sapi` on Windows)
- `remotion-studio/src/remotion/deck/` — deck model/composition/player
