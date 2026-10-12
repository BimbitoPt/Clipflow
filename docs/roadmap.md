# Clipflow Roadmap

Conservative by policy: **better to overdeliver than under.** Each phase is
small, independently shippable, and gated — the next phase starts only when
the current one is done, verified, and merged. No dates; phases complete
when their exit criteria pass, not when a calendar says so. Anything not
listed here is explicitly not promised.

Related: `docs/product-design.md` §9 (what shipped), `docs/architecture.md`
(how it's built), `docs/market-alignment-audit.md` (why these items).

## Ground rules

1. One phase at a time. No parallel phases, no "90% done" carries.
2. Every slice ships behind the three foundation docs — behavior in
   `product-design.md`, contracts in `architecture.md`, visuals in
   `design-system.md` — updated in the same PR.
3. Every slice keeps 100% of tests green, `tsc` clean, production build
   green. A phase with a red suite is not a phase, it's a draft.
4. Manual verification where automation can't reach: one real Chrome
   export + one desktop export per phase that touches rendering or export.
5. If a slice grows past ~3 focused changes, split it. Small batches are
   the whole strategy.

## Baseline (shipped, on `master`)

DIY studio: deterministic 5-cue scripts, safe-zone phrase captions with
karaoke emphasis, hook card, platform presets, OPFS upload durability +
session restore, activation metric + warm start, worker-based export with
probes, week queue, opt-in end card (browser + desktop), Tauri desktop
with native projects and FFmpeg export, Remotion batch studio with
mirrored caption policy.

## Phase 1 — Trust the file (stability + fidelity)

Goal: every export is provably what the preview promised. Nothing new for
users to learn.

- [ ] Manual export matrix, recorded: Chrome browser export (voice on/off,
      credit on/off, upload scene) + desktop export of the same project.
      Byte-compare durations, watch once fully. File the checklist in the
      PR; repeat for every later phase that touches render/export.
- [ ] Skip video seeks on desktop credit-card frames (known waste noted in
      review: card frames reuse the CTA cue and seek its video for nothing).
- [ ] Preview = export audit: screenshot-diff one preview frame against its
      exported frame (same cue, same settings). Fix discrepancies found;
      document tolerance.
- [ ] `EmphasizedPhrase` test coverage in `SceneFrame.test.ts` (active word
      highlighted, first occurrence only, graceful no-match).

Exit: matrix filed green, zero known render/export discrepancies, suite green.

## Phase 2 — Look pro (caption quality)

Goal: captions match what top creators post. No new surfaces.

- [ ] Caption style presets (≥3, per teardown): e.g. Hormozi punch
      (1–3 words, huge), calm readable (4–7 words), minimal mono.
      One mode per video still holds; presets change grouping + scale only.
- [ ] Caption proofing pass before export: transcript review step that
      blocks burn-in typos (burned-in text is permanent).
- [ ] Safe-zone overlay toggle in preview: show the TikTok/Reels/Shorts
      danger zones over the phone frame so placement is verifiable by eye.

Exit: 3 presets shipped with tests, proofing step live, overlay toggle live.

## Phase 3 — Go further (reach + quality tiers)

Goal: serve heavier users without complicating the core loop. Each item
ships alone, in this order.

- [ ] DIY → batch-studio handoff: export the current clip as a
      batch-compatible brief (CSV row the studio already ingests) so a
      week's queue can graduate to batch production.
- [ ] 1080p export as the paid-convenience path (export-time upgrade only —
      creation stays free, per the paywall-at-export principle).
- [ ] Cloud voices as an optional convenience next to local SpeechT5,
      never a replacement. Local stays default.

Exit per item: working end-to-end behind the existing principles, docs updated.

## Phase 4 — Grow (distribution, Managed-first)

Goal: the product acquires users. Built where accounts exist.

- [ ] Template/pack sharing and referral attribution on the Managed door.
- [ ] DIY gets only what needs no identity: end-card opt-in rate review,
      share affordance for finished files.
- [ ] Activation metric review: once real usage exists, compare
      activated vs. non-activated retention before any other growth work.

Exit: loop v2 live on Managed; DIY untouched except measurement.

## Explicitly not on this roadmap

Cross-machine upload portability (bytes in project files), Firefox/Safari
browser export (desktop app is the answer), cloud rendering, auto-posting,
4K in DIY, collaboration, credit meters, watermarks, mobile native apps,
virality scores. See `product-design.md` §7. Promising any of these
requires a roadmap amendment PR first — not a side quest inside another phase.
