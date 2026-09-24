# Plan: Clipflow engine self-serve (stop re-prompting agents per video)

Date: 2026-09-18
Goal: encode the 5 manual round-trips from mstudio-sites-917-v5 into engine features so one prompt (idea + optional cues) produces the full post package: video, taste-respecting mapping, slop-free captions, cover, variants.

Baseline (verified green): `cargo test` in `native/` (19 lib + 4 bin), `npx vitest run` in `saas/` (27 tests), clippy `-D warnings` clean.

## Task 1 — Source families + per-video variety rule (broll.rs)

Learning: "each site once per video max" was a manual `--cue-assets` decision for every render.

1. Add `pub fn family(src: &str) -> &str` to `broll.rs`: returns `"web"` if src starts `/broll/clips/web-`, `"clips"` if `/broll/clips/`, `"photos"` if `/broll/pexels/`, else `"misc"`.
2. In `assign_cue_assets_with_usage` (native/src/broll.rs:232), after scoring each cue's candidate pool, skip candidates whose family was already assigned to an earlier cue in THIS video; only skip if a same-score-tier candidate of another family exists (fallback: when all families are exhausted, allow reuse but never consecutive cues from the same family).
3. Add `max_uses: u32` (default per family: web=1, clips=1, photos=2) — implement as constants, not pack fields, until evidence demands pack-driven values.
4. `pinned_cue_assets` (manual override) is unaffected — pinning intentionally bypasses variety.

Verify (in `native/`): `cargo test broll` + new unit tests:
- 6 own-site entries + cues that score web-pool highest → duplicates become impossible.
- Pinning with `pinned_cue_assets` still works and returns entries even across families.
- `cargo clippy -- -D warnings` clean.

Done: automated render of an agency idea can never show the same site twice.

## Task 2 — Clip rating persistence (broll.rs)

Learning: you manually pruned "film-gear", "hands", "junk stock" entries. Keep the pool, teach the LRU to respect your taste.

1. Extend `BrollUsage` (native/src/broll.rs:146): new field `penalty: HashMap<String, u32>` keyed by canonical source (same `source_of` scheme). New method `penalize(&mut self, src: &str, by: u32)` and `penalty_of(&entry) -> u32`. `save_usage`/`load_usage` gain the field (serde default; old files load unchanged).
2. Add CLI `--rate <src>=<-2..+2>` (may be repeated). Parse in `main.rs` before render; call `penalize` into the usage file and exit without rendering.
3. In `assign_cue_assets_with_usage` scoring, subtract `penalty_of` from each candidate's score so penalized entries drop tier; +2 entries surface first.
4. Usage file stays `public/.broll-usage.json` (gitignored).

Verify (in `native/`): `cargo test broll` — unit tests: penalize→score-order flips; old usage file (no penalty key) still loads; `--rate` arm writes penalty and exits 0.

Done: one `--rate /broll/clips/studio-v11.mp4=-2` command replaces a chat round-trip; preference persists.

## Task 3 — Per-pack banned-phrase scrub (script.rs)

Learning: the repeated caption audits were chasing tagline leakage and slop into agency copy.

1. Add optional `banned: Vec<String>` to the pack JSON schema (`native/packs/mstudio.json` + byte-synced `src/packs/mstudio.json`; parse and require presence — fail `E_PACK_BANNED` if missing, mirroring E_PACK_BEATS at native/src/script.rs:108).
2. For mstudio pack: `["idea in, video out.", "clipflow", "early access", "waitlist"]` (case-insensitive match, trimmed of punctuation).
3. In `build_script` (native/src/script.rs:66), after hook/beats/cta assembly, check hook+beats+cta lowercase for any banned substring; on match, bail `E_BANNED_PHRASE: "<phrase>" in hook` (etc.) so failure is loud in tests, and delete it from the assembled text via a `scrub(script)` helper used by render arm (soft-fail render, hard-fail tests).
4. Update `native/packs/mstudio.json` / `src/packs/mstudio.json` in lockstep; extend the caption golden test asserting none of the banned strings appear in the 79-word golden.

Verify (in `native/`): `cargo test script` — new test: pack with "clipflow" leaking bails; mstudio pack passes; goldens unchanged.

Done: tagline/agency-slop leakage becomes an engine error, not a chat correction.

## Task 4 — Cover render step (SaaS worker + CLI flag)

Learning: the cover took its own agent session (drawtext fallback → HTML template). The template now exists at `thumbs/cover-v5.html` — productionize it.

1. Generalize `thumbs/cover-v5.html` → `thumbs/cover-template.html`: replace headline/sub/chips text with `{hook}`, `{sub}`, `{chip1}`, `{chip2}`, `{url}`, `{shot}` placeholders (a tiny `scripts/render-cover.mjs` does string substitution; no template engine).
2. New CLI flag `--cover <frame_secs>` on the native binary: after render, run ffmpeg (same sidecar the render path already spawns) to grab the HOOK-cue midpoint frame → `temp/cover-base.jpg`, print the path; exit. Extraction logic mirrors what we did for v5 (`-ss`, `-frames:v 1`, `-update 1`, `-q:v 2`).
3. New script `scripts/render-cover.mjs <video.mp4> <outdir>`: orchestrates `clipflow --cover`, writes filled template to temp, screenshots at deviceScaleFactor 2 via pinned chromium (`CHROME_PATH` fallback path identical to scripts/shoot-websites.mjs:69), saves `<outdir>/cover.jpg`. Depends on `node_modules/ffmpeg-static` + `playwright` (both installed).
4. Wire into worker: after `renderCli` (saas/lib/render-cli.ts:24) succeeds, run the cover script via `node` on the promoted artifact; cover failure is non-fatal (log, keep video). The `{hook}` substitution for each video comes from the job's generated script (cue-shell HOOK text is already persisted by the render path).

Verify: run `node scripts/render-cover.mjs exports/mstudio-sites-917-v5.mp4 exports` → produces cover.jpg visually equivalent to today's iteration-3 output. SaaS: `npx vitest run` still 27/27 (worker path passed/stubbed).

Done: one command → video + cover, no agent.

## Task 5 — `--variants N` multi-render (main.rs)

Learning: v2→v5 were separate agent-driven re-renders with hand-decided mappings.

1. Add `--variants <N>` (1-5; default 1 = current single render; mutually exclusive with `--cue-assets`).
2. Loop N times calling the existing render path; each iteration passes a distinct `variant_seed` into `assign_cue_assets_with_usage` (new param) which shuffles within-tier candidates deterministically from `(idea, variant)` — no global state.
3. Output naming: existing `exports/<slug>-<N>.mp4` family per variant (slug + `-v2/-v3` pattern as today's files).
4. Downstream (SaaS worker) renders variant 1 only; variants are a CLI power feature for manual pick of the batch-to-post. Do not change job schema.

Verify (in `native/`): `cargo test main_bin` — test: variants 2 with same idea produce deterministic, non-identical cue maps (different mapping or error-free second file). `cargo test` full run stays green.

Done: "show me another take" = rerun with `--variants 3`, not an agent session.

## Execution order

Tasks 1-3 are native-adjacent and unblock CI: order 1→2→3. Task 4 independent (can run parallel). Task 5 depends on Task 1's family concept. Each task ends with the repo-default green gates (`cargo test`, clippy, saas vitest) before the next starts.

Skipped deliberately (evidence-based probes later if wanted): automatic clip-rating demo site in SaaS UI, pack editor, thumbnail A/B.
