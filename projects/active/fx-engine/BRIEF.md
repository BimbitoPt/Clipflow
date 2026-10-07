# BRIEF — FX Engine (niche-aware motion graphics)

## Goal
`shared/effects/`: registry + graph builder + niche profiles + composer that
turns a niche/topic into a timed, budgeted FFmpeg filter graph of pure-filter
effects (no external assets). Integrated into the script FFmpeg pipeline
without breaking existing behavior (native Rust render untouched).

## Acceptance criteria
- [ ] `shared/effects/` with registry, `FilterGraph` builder (no ad-hoc string concat), niche JSON profiles, pluggable keyword scorer, composer (budget, spacing, seed, levels)
- [ ] Universal pack + 7 niche packs (editing, tech, gaming, finance, fitness, food, edu), config-only niche addition
- [ ] `scripts/render-fx-samples.mjs` renders one preview clip per niche pack
- [ ] Unit tests: graph builder, niche scorer, composer (budget/determinism)
- [ ] README section: add an effect, add a niche
- [ ] `npm test` green; samples render with ffmpeg-static

## Scope
In: TS module, JSON profiles, composer, samples, tests, docs.
Out: native `render.rs` splice (documented follow-up), LLM scorer (interface only),
     sprite-sheet stickers (optional, only if trivial).

## References
- `native/src/render.rs:72` — product FFmpeg pipeline shape (segments→concat→brand→subs)
- `scripts/render-landing-hero.mjs` — `-filter_complex_script` pattern, escaping
- `src/packs/*.json`, `src/lib/packs.ts` — existing niche pack concept
- `shared/visual-effects.ts`, `shared/motion-direction.ts` — existing hooks
