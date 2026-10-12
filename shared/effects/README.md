# FX Engine — niche-aware motion graphics

Pure-FFmpeg, asset-free effects picked automatically by video niche.
`shared/effects/` builds one `filter_complex` graph; scripts render it.

## Layout

| File | Job |
|---|---|
| `types.ts` | Contracts: `EffectDef`, `NicheProfile`, `FxCtx`, `PlacedEffect` … |
| `graph.ts` | `FilterGraph` builder (never concat strings ad hoc), `validate()`, `checkFilters()` (`ffmpeg -filters`), `formatCommand()` for failure logs |
| `registry.ts` | `registerEffect` / `getEffect` / `effectsForNiche` |
| `niches.json` | Niche → effect pack + grade + transition + caption style + pacing |
| `niches.ts` | Loader + validation |
| `scorer.ts` | Keyword scorer + `detectNiche` (override → description 2x → transcript/title → universal). `NicheScorer` is pluggable — swap in an LLM call later |
| `composer.ts` | Triggers (cuts/beats/keywords/pacing) + budget (max/10s, min gap, no stacked heavies) + seed (`mulberry32`) + levels + toggles + `previewPlan` |
| `ass.ts` | Animated ASS captions (`pop` / `karaoke` / `bounce` / `clean`) via `speechPhrases` |
| `fx.ts` | Effect primitives (resolution-relative, time-gated) |
| `packs/` | `universal`, `grades`, + one file per niche; `index.ts` registers all + `validatePackRefs` |

## Render a sample per niche

```powershell
node scripts/render-fx-samples.mjs --level=medium            # all niches
node scripts/render-fx-samples.mjs --niche=gaming --level=hype --seed=3
```

Output: `outputs/fx-samples/<niche>.mp4` (360x640 previews). The runner
validates the graph, probes required filters and recomposes skipping missing
ones (fallback chain), and prints the full ffmpeg command on failure.

## Add a new effect

1. Add a primitive in `fx.ts` (or reuse one). Rules:
   - `drawbox` understands **iw/ih only**; `drawtext` understands **w/h/text_w only**. Mixing them errors (or crashes this build).
   - `crop`/`scale` w/h are config-time — animate only x/y, or use `zoompan` for zooms.
   - Gate everything with `enable='between(t,a,b)'` or an alpha/t expression.
   - Positions relative to output size; font sizes as `h/…` expressions.
   - If you need a filter beyond the base set, return `requires: ["name"]`.
2. Register it in the right `packs/<niche>.ts` (or `universal.ts`):
   `niches: ["gaming"]` or `["universal"]`, category, intensities, `heavy`.
3. Optional: reference it from `niches.json` (weight, fixed intensity).

## Add a new niche (config only)

Append to `niches.json`: `id`, `label`, `keywords[]` (scorer), and `pack`
(`effects[]` with weights, `grade`, `transition`, `captionStyle`, `pacing`).
Add stills + accent in `scripts/fx-sample-runner.ts` (`STILLS`, `ACCENTS`),
then `node scripts/render-fx-samples.mjs --niche=<id>`.

Packs come in two flavors: **topic** profiles (editing, tech, gaming,
finance, fitness, food, edu — *what* the video is about) and **channel**
profiles (product-demo, social-x, shortform — *where* it plays and which
player behavior it needs: endcaps, timecodes, follow-zooms). Both are the
same config shape; selection is single-profile via override today.

## Integrate into a pipeline

```ts
import { composeTimeline, nicheProfile, FilterGraph } from "./packs/index";

const graph = new FilterGraph();
// ... segment chains ... concat -> [vcat] ...
const fx = composeTimeline({ profile: nicheProfile("editing"), duration: 45,
  level: "medium", seed: 7, ctx, cues: { cuts, beats, keywords },
  graph, fromLabel: "[vcat]", assCues });
// writeFileSync(assPath, fx.ass); chain ass burn + format; validate(); render
```

`ctx` carries W/H/fps/duration/accent/fontFile. `extraInputs` from the result
must be appended as `-i` args after the main inputs, in order. `level: "off"`
yields an empty graph (passthrough). Same seed + inputs = same placement.

Native CLI follow-up: `native/src/render.rs::render()` has the same
segments→concat→brand→subs shape — splice the composer chain between
`[vcat]` and the drawbox brand bar (pass `--fx-level/--fx-seed` through
`main.rs`). Not wired yet, by design: nothing existing changed.

## Known build quirks (ffmpeg-static 6.1.1, Windows)

- Long graphs must go through `-filter_complex_script` (32k argv limit).
- Unknown expression vars can **crash** (0xC000001D), not just error —
  hence the `drawbox`/`drawtext` var tests in `effects-packs.test.ts`.
- `xfade`/`setpts` retiming need two streams or timestamp shifts, so they
  are segment-scope (caller-side), not composer chain effects.
