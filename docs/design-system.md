# Clipflow Design System

Single source of truth for every Clipflow surface: the DIY studio (`src/`),
the desktop shell (`src-tauri/` + `DesktopToolbar`), the batch studio
(`remotion-studio/`), and marketing (`landing/`, `signal-house-app/`).
Any new UI or rendered frame must follow this file. If the file and an
implementation disagree, update the weaker one and note it here.

Sources: `src/index.css`, `src/packs/mstudio.json`,
`remotion-studio/app/globals.css`, `shared/visual-effects.ts`.

## 1. Brand tokens

| Token | Value | Use |
|---|---|---|
| `--cf-bg` / app base | `#080A0D` (`body`), radial lime glow `#1A2410 → #080A0D` (`.cf-app`) | Page background. Never pure black in UI chrome. |
| Panel | `#0B0F14` | All panels (`.cf-idea-panel`, `.cf-script-panel`, `.cf-preview-panel`, `.cf-scene-tray`, `.cf-export-panel`). |
| Panel deep | `#0B110D` / `#090E0B` | Beat cards, inputs, textarea wells. |
| Border | `#2A3340` (cards/panels), `#344737` (inputs), `#374235` (toolbar) | 1px borders everywhere. No border without a token color. |
| Text primary | `#F2F5ED` / `#F7F8FA` | Headings, body. |
| Text secondary | `#9BAC9B` | Panel descriptions. |
| Text muted | `#7B8C7B` / `#849784` | Notes, hints, footers. |
| Accent | `#CFFF47` (UI + render theme 2), `#246BFD` (render theme 1) | The only CTA/focus color. |
| Danger | `#FFB6A9` | Errors and warnings only (`.cf-error`, `.cf-warning`). |
| Radius | `999px` buttons (pill), `7px` inputs/cards, `24px` panels, `14px` toolbar | Round up with size, never down. |
| Focus ring | `border-color: #CFFF47` + `box-shadow: 0 0 0 2px #CFFF4724` | All focusable inputs. |
| Disabled | `opacity: .52`, `cursor: not-allowed` | Buttons only. |

Accent rule: exactly one accent element per viewport section. The accent is
a signal (CTA, active tab, selected beat, progress fill) — never decoration.

## 2. Typography

- **UI font:** `Inter, ui-sans-serif, system-ui, sans-serif` (`:root` in
  `src/index.css:12`). No webfont in the studio; system stack only.
- **Display:** headings `letter-spacing: -.05em` to `-.08em`, weight 800–900,
  tight `line-height` (`.99–1.1`). Hero may use `Georgia, serif` italic for
  one emphasized word (`.cf-hero h1 em`).
- **Meta/labels:** `ui-monospace, SFMono-Regular, Consolas, monospace`,
  `11px`, `letter-spacing: .1em`, uppercase — kickers, nav, pills, strip
  labels, buttons, footer (`src/index.css:23`).
- **Render font (video frames):** `700 96px system-ui, sans-serif`, fitted
  down at export (`src/packs/mstudio.json:23-24`, `src/lib/render.ts`).
  Captions inside frames: bold system-ui, scene labels uppercase.

Type scale (studio): hero `clamp(37px, 4.5vw, 66px)` → panel `h2 25px`
→ preview `h2 20px` → body `13–14px` → notes `11–12px` → micro `9–11px`
mono labels. Never invent a size between steps; snap to the nearest.

## 3. Layout

- Shell: `width: min(1560px, 100% - 48px)`, centered (`.cf-shell`).
- Header: `72px`, brand left (mark `34px` + `CLIPFLOW` 900/19px/`-.08em`),
  section label, `LOCAL-FIRST` pill right with green dot.
- Workspace grid (desktop ≥1120px): `1fr | 370px | 1fr` —
  editor | sticky preview | visuals (`.cf-workspace`).
- Export panel grid: `1fr | 1fr | 1fr` (controls | progress | post copy).
- Breakpoints: `1120px` (two-col, visuals full-width), `760px`
  (single column, preview first via `order: -1`, canvas `210px`),
  `430px` (compact padding, 3-col image grid). Mobile is a first-class
  target: preview-first order and thumb-friendly tap targets are mandatory.
- Dark only: `:root { color-scheme: dark }`. No light mode.

## 4. Components

All class names live in `src/index.css` under the `cf-` prefix. Reuse, don't
reinvent.

- **Panels** (`.cf-idea-panel`, `.cf-script-panel`, `.cf-preview-panel`,
  `.cf-scene-tray`, `.cf-export-panel`): `#0B0F14`, `1px #2A3340`,
  `24px` radius, `28px` padding, heading block `.cf-panel-heading`
  (step number + `h2` + 13px description).
- **Step number** (`.cf-step-num`): lime `#CFFF47` bold label stacked above
  the panel `h2` — boards-style headers: `01` Idea, `02` Script,
  `03` Visuals, `04` Export.
- **Journey** (`.cf-journey`): dot-progress in the hero doubling as in-page
  navigation — hollow `○` idle, lime `●` + filled pill on active/done steps.
- **Kicker** (`.cf-kicker`): mono 11px, accent, bold — secondary labels
  (e.g. `LIVE FRAME`, `DESKTOP STUDIO`).
- **Buttons** (`.cf-button`): mono 11px bold, `11px 20px` padding, `999px`
  pill radius. Primary = accent fill on dark text; secondary = `#172318` fill.
  Hover brightens (`brightness(1.12)`); never change hue on hover.
  `.cf-sample-idea` is the full-width empty-state variant (warm start).
- **Beats** (`.cf-beat`): deep card, textarea inside; `.selected` gets
  accent border + `#151F15` background. Top row: index + label left,
  text-button + reset right.
- **Scene strip**: 5 equal buttons with `38px` thumbs; active = accent
  border + accent text + `#1C2B1B` background.
- **Library tabs**: underline tabs, active = accent text + accent border.
- **Image grid**: 4 columns (3 on ≤430px), selected = `2px` accent border.
- **Upload**: dashed `#597151` dropzone, accent text.
- **Proof approval** (`.cf-proof-approval`): bordered checkbox card —
  used for upload consent, always explicit opt-in copy.
- **Export progress**: `5px` track `#243123`, accent fill span, mono status
  line beneath.
- **Post copy**: stacked `<details>` rows (TikTok / X / LinkedIn), mono
  summary, accent copy affordance.
- **Desktop toolbar** (`.cf-desktop-toolbar`): `#151C15`, `14px` radius,
  `20px 24px` padding, path + dirty state left, New/Open/Save/Import
  actions right; Save is the accent button. Shares studio tokens —
  native chrome must be indistinguishable from web panels.
- **Preview phone frame** (`.cf-canvas-wrap`): `max 286px` wide, `7px`
  `#050805` bezel, `1px #4B604A` ring, deep shadow, `15px` radius,
  `9/16` canvas. The frame is the product — always render preview inside it.

## 5. Rendered-frame style (video output)

Governed by `src/lib/render.ts` + pack themes, mirrored in
`remotion-studio/src/remotion/shared/SceneFrame.tsx`. Frames and UI share
the accent but frames may use theme 1 (`#246BFD`) or theme 2 (`#CFFF47`).

- Canvas `720×1280` (preview `360×640`), 9:16 always.
- Layer order: gradient bg → scene variant → cover-fit b-roll + dim
  (`0.55` alpha, `0.16` over real footage) → motion graphic →
  0.15s edge dip → effect grade → accent bar → captions → progress bar.
- Scene variants: `rays` (hook), `blobs`/`grid`/`waves` (beats), `pulse`
  (CTA) — see `variantForKind`.
- Captions: phrase-based (`shared/caption-plan.ts`), max 2 lines, anchored at
  `CAPTION_ANCHOR_RATIO` (0.64H) so the block (~0.60–0.75H) stays inside the
  platform safe zone — platform UI covers the top ~9% and bottom ~18%, so
  bottom-third captions get covered on cross-posts. Bold system-ui over a
  dark scrim; scene kind uppercase with accent side-tick. Platform presets
  (`shared/platform-presets.ts`: TikTok 0.64, Reels 0.62, Shorts 0.66)
  nudge the baseline per app overlay; values clamp to 0.60–0.70.
- Hook card: the clip's promise (first 8 words of the hook, `hookHeadline`)
  held over the opening 4 seconds at 0.16H — dark plate, white extra-bold,
  accent underline. Shrink-to-fit with a relative floor, spilling to two
  lines if needed, so it holds at both preview (360) and export (720)
  widths. Muted autoplay reads it before any audio registers.
- End card (opt-in `RenderExtra.endCard`, `CREDIT_SECS = 2`): the whole
  frame — near-black, `MADE WITH` mono over `CLIPFLOW` extra-black with an
  accent bar. No captions, no b-roll, no motion. Every credited export is
  a distribution impression.
- Week queue (`.cf-queue-row`): one idea per line, position counter,
  `LOAD NEXT IDEA` secondary button. Same panel language as the idea box.
- Active word: the sounding word overdraws in accent at 1.15x
  (`findActiveWord` in `src/lib/render.ts`, `EmphasizedPhrase` in
  `SceneFrame.tsx`). Speech phrases only — scene labels have no word
  timing. One accent, one mode per video.
- No cue pills, no watermarks, no full-paragraph captions — ever.
- Visual effects (`shared/visual-effects.ts`): `none | cinematic | mono |
  vivid | analog`. Grade via `ctx.filter` + overlay; `analog` adds
  scanlines + vignette. Same filter constants in Canvas and Remotion.

## 6. Motion language

Motion intents (`shared/motion-direction.ts`): `transform | sequence |
comparison | evidence-reveal | payoff | kinetic-type | focus | metric |
none`. Rules:

- Copy-matched, never decorative: `vs`/`before-after` → comparison,
  `from X to Y` → transform, numbers → metric, showcase footage → none.
- Progress-driven (`0→1` across the cue), deterministic — same script,
  same motion, every render.
- UI motion is minimal: smooth scroll, hover brighten, progress fill.
  `prefers-reduced-motion` disables animation globally
  (`src/index.css:75`).

## 7. Voice, copy, imagery

- Studio voice: direct, builder-tone, monospace kickers + plain-spoken
  descriptions. Never marketing fluff in the product itself.
- Pack copy rules (`src/packs/mstudio.json:27`): banned words
  (`idea in, video out.`, `clipflow`, `early access`, `waitlist`,
  `join the waitlist`) must never appear in generated scripts.
- Script shape is fixed: hook + 3 beats + CTA, 5 cues, 45s total.
- B-roll: local `public/broll/` pool with keyword matching; uploads
  require proof approval before export use.
- Brand mark: `/brand/mark.png` (studio header), SVG marks in
  `brand/` and `remotion-studio/public/brand/`. Lime-on-near-black
  only; never recolor the mark.

## 8. Accessibility (non-negotiable)

- All form fields labeled; icon-only buttons get `aria-label`.
- Focus visible via the accent ring (§1).
- Beat selection and scene strip are buttons, keyboard reachable.
- Error/warning text never color-only — text content carries meaning.
- `prefers-reduced-motion` respected; captions readable without motion.
- Contrast: primary text on panel ≥ 7:1 by construction (`#F2F5ED` on
  `#111713`); muted text is for non-essential notes only.

## 9. Rules for AI agents (read before every change)

1. Reuse `cf-` classes and tokens. New CSS only for genuinely new
   patterns — and then add them here.
2. One accent per section. No new hues without updating §1.
3. Mono for labels, Inter for body, system-ui bold in frames. No new
   font stacks.
4. Preview stays in the phone frame; export stays 9:16.
5. `shared/` policy (captions, effects, motion) is imported, never
   duplicated — Canvas and Remotion stay in sync via the same modules.
6. Every user-facing string change must respect pack `banned` lists.
7. Mobile breakpoints (§3) must still hold after layout changes.
