# Clipflow Product Design

What Clipflow is, who it's for, and how the product must behave. Read with
`docs/architecture.md` (how it's built) and `docs/design-system.md`
(how it looks). Decisions here outrank implementation convenience —
when the code and this file disagree, change the code or bring the
conflict to the owner.

## 1. Positioning

> Clipflow is one engine with two doors.

- **Clipflow (DIY)** — free, local-first studio you run yourself. No
  server, no keys, no auto-post. Unlimited drafts, clean 720p export
  free forever. This is the default and the product's heart.
- **Clipflow Managed** — done-for-you short-form by MSTUDIO
  (see `docs/clipflow-saas.md`, `docs/managed.md`). The upgrade path,
  same engine, same loop.

The wedge (from `docs/teardown.md`): every competitor meters creativity
(credits, watermarks, expiring projects, dual meters). Clipflow meters
nothing at creation — monetization, if any, fires at export upgrades
only (1080p, batch, cloud voices). Convenience is sold; hostage-taking
is not.

## 2. Users

Primary: solo creators, indie hackers, and small brands who post
short-form to sell (sites, offers, proof). They have ideas and raw
footage but no editing time. Secondary: MSTUDIO clients on the Managed
door. Non-user: teams needing cloud collaboration, multi-ratio 4K
pipelines, or auto-posting — explicitly out of scope for DIY v1.

User promises (DIY):

1. Idea in, video out, in minutes — zero config start (MSTUDIO default
   profile, idea box on first screen, ≤3 steps to first render).
2. Your files stay yours — local-first rendering, local assets,
   portable `.clipflow` projects. No uploads to render.
3. Free means free — no watermark, no expiry, no credit meter on drafts
   or 720p export.

## 3. The DIY loop

1. **Profile** — niche, audience, offer, tone, proof. Defaults to
   MSTUDIO; editable inline, saved to localStorage.
2. **Idea** — one textarea. Empty state guides, never a blank wall.
   A one-click sample idea (`SAMPLE_IDEA` in `src/lib/activation.ts`)
   warm-starts first-timers: value before typing.
3. **Script** — deterministic hook + 3 beats + CTA (5 cues, 45s).
   Every beat editable, resettable, selectable to preview its frame.
   The script is the source of truth: narration, captions, motion,
   and post copy all derive from it.
4. **Visuals** — per-scene picker: auto-AI background, curated library,
   stock video, or upload (proof approval required). Live canvas
   preview in the phone frame, mid-cue frame on selection.
5. **Voice & look** — voice on/off + preview, caption mode
   (`auto|scene|speech|off`), visual effect grade.
6. **Export** — one button: browser MP4 download or desktop native
   file. Progress with honest status messages; cancellation on
   desktop. Post copy (TikTok / X / LinkedIn) with one-tap copy.

Ordering is fixed and spatial: editor left, sticky preview center,
visuals right; export below; post copy last. Mobile stacks preview
first. Never reorder the loop without updating this file.

## 4. Screen inventory (DIY studio)

| Surface | Purpose | Key rules |
|---|---|---|
| Header | Brand + door signal | Mark + `CLIPFLOW`, loop label, `LOCAL-FIRST` pill. Desktop links home to `#idea` (no router escape). |
| Hero | Orientation | One headline, one subline, index of the loop. Sets tone; not a landing page. |
| Flow nav | Anchor navigation | Idea → Script → Preview → Visuals → Export. Mono, always visible. |
| Idea panel | Input + profile | Idea textarea first; profile in a `<details>` disclosure. Save confirms inline. |
| Script panel | Story structure | 5 beats, selected state, per-beat caption label when in scene-caption mode. |
| Preview panel | Truth | Phone frame canvas, scene strip (HOOK/BEAT×3/CTA), ratio note. Sticky on desktop. |
| Scene tray | Visual assignment | Current-look card, library tabs, upload dropzone, proof-approval checkbox. |
| Export panel | Output | Voice toggle, caption/effect controls, export CTA, progress, post-copy details. |
| Desktop toolbar | Native projects | New/Open/Save/Import, path + dirty dot, busy states, Ctrl+S/O/N shortcuts, close-guard on unsaved work. |
| Footer | Exit | Wordmark + managed upsell link. One link, quiet. |

Every panel opens with a mono kicker (`SECTION / NN`) per the design
system. New surfaces must register in this table.

## 5. Content rules

- **Script shape is fixed:** hook (0–4s), three beats (4–40s), CTA
  (40–45s). Generator is deterministic — same idea + profile, same
  script. No LLM in the DIY path, no network, no virality scores.
- **Pack bans are law** (`src/packs/*.json`): banned phrases never
  appear in output. New packs inherit the rule.
- **Captions default on.** Phrase-based (≤5-word groups, max 2 lines)
  anchored in the platform safe zone (~0.60–0.75H, never the bottom
  18%), scene labels uppercase with accent tick in scene mode. The
  sounding word pops in accent at 1.15x (karaoke emphasis); full-paragraph
  captions are a bug.
- **Motion is copy-directed** (`transform|sequence|comparison|
  evidence-reveal|payoff|kinetic-type|focus|metric|none`), never
  decorative. Same script → same motion.
- **B-roll honesty:** stock is keyword-matched; uploads need proof
  approval; site queries open on real site footage, never lifestyle
  filler. Mismatched visuals are a defect, not a shrug.
- **Post copy** derives from the script (hook + CTA), trimmed per
  platform, hashtags from the pack.

## 6. Quality bars (ship gates)

- First render ≤3 steps from a cold start with defaults. Sample idea →
  preview is 1 click; instrumented as `firstPreview` in
  `src/lib/activation.ts`.
- **Activation = first export** (a video file in hand — tight by design).
  TTV = `firstVisit` → `firstExport`, target minutes, measured locally,
  not asserted. Mini-aha = first preview. When a backend exists, compare
  activated vs. non-activated retention before any other growth work.
- Preview updates on every beat/scene/voice/caption/effect change —
  no stale frames.
- `drawFrame` never throws on any input (tests enforce).
- Export works offline (desktop) and in stock Chrome/Edge (browser);
  missing encoders produce a plain-language error, never a hang.
- 94+ root tests and the remotion-studio suite stay green; pool-size
  tests updated with pool changes.
- PWA installable, `LOCAL-FIRST` pill truthful: zero DIY network
  calls to render or export.

## 7. Non-goals (say no by default)

Cloud rendering, auto-posting/scheduling, multi-ratio and 4K in DIY,
collaboration, credit meters, watermarks, project expiry, mobile native
apps, virality scoring. Each has a competitor to lose to and a reason
documented in `docs/teardown.md`. Revisit only with owner sign-off and
a line added here.

## 8. Roadmap hooks

Near-term improvement vectors (ordered): preview fidelity (export =
preview pixels), caption style presets (≥3, per teardown), batch/queue
in DIY via the remotion-studio pipeline, 1080p export upgrade path,
cloud voices as a paid convenience. Managed door owns fulfillment;
DIY owns the loop. Improvements land behind these docs: product
behavior here, contracts in `architecture.md`, visuals in
`design-system.md`.
