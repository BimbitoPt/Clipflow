# Free media & QA research (Oct 2026)

Roadmap item #5: four picks for upgrading Clipflow's media pipeline, all free
(FOSS or genuinely free tier). Researched 2026-10-11; every claim below was
verified against current sources that day.

## 1. Stock footage: Pexels + Pixabay APIs

| | Pexels | Pixabay |
|---|---|---|
| Media | photos + videos | photos + vectors + videos (**no music via API**) |
| License | Pexels License — free commercial use, no attribution required (they politely ask) | Pixabay Content License — free commercial use; when showing search results, say where they came from |
| Rate limit | free key, generous hourly/monthly cap | 100 req / 60 s per key; 500 hits per query; responses cacheable 24 h |
| Video renditions | multiple sizes | `large`/`medium`/`small`/`tiny` MP4 renditions with direct CDN URLs |

**Integration path (effort: small).** The PWA already picks scene media from a
static `STOCK_POOL`. Add a fetch-on-export fallback: on cache miss, query both
APIs with the cue keywords (`resolveSceneChoices` already produces them),
download one `medium`/`small` rendition into the project, and treat it like an
upload asset. Cache downloads by URL hash (Pixabay requires 24 h caching;
neither allows hotlinking long-term). Keep the static pool as the default so
offline/graceful degradation is unchanged.

Requires: free API keys for both (signup, ~5 min each).

## 2. Music beds: ACE-Step 1.5 (local, Apache-licensed)

- **ACE-Step 1.5** (Apr 2026): open-source music foundation model, runs locally
  in **< 4 GB VRAM** — fits the RTX 2060 6 GB with room for the voice model.
  Windows portable package available; ~real-time-factor very fast (v1 was 27×
  realtime). 1.5 XL (4B DiT) exists but needs more VRAM — skip it.
- **Pixabay music: no API.** Their music library is site-only; the API docs
  cover images and videos exclusively. So "just fetch beds from Pixabay" is not
  automatable — manual downloads remain an option but don't scale.
- MusicGen small / Stable-Audio Open also fit but ACE-Step 1.5 is both smaller
  and better at full songs; TTM-Bench (2026) measured it as the lowest-latency
  open model.

**Integration path (effort: medium, one-off script).** The studio already has a
bed slot per brand (`creative.musicPath`, consumed by `shared/audio-mix`'s
`musicBedChain`/ducking). A `scripts/generate-music-beds.ts` can render 4–8
prompted beds once per brand ("minimal electronic bed, 60 bpm, no vocals"),
normalize them like voiceovers, and drop them in `public/local-assets/`. No
runtime dependency: generation is offline; renders keep using static files.

Requires: Python env for ACE-Step (isolated from the Node pipeline), ~4 GB
download.

## 3. GL Transitions in the fframes Rust spike (wgpu)

- **gl-transitions** collection: ~70 community GLSL transitions (luma wipe,
  circleopen, filmburn, morph…), permissive licenses (mostly MIT/CC0 headers
  per file).
- The spike renders on **tiny-skia (CPU)**, which cannot run GLSL. Two routes:
  1. **wgpu render path** (recommended): add a `wgpu` stage that takes the
     tiny-skia frames as textures and applies the transition shader on the
     GPU. wgpu (v26) consumes GLSL directly via naga or compiles it to
     WGSL/DX12. Medium effort; also unlocks GPU scaling.
  2. `ffmpeg-gl-transition` filter: needs a custom ffmpeg build with OpenGL —
     painful on Windows and fights the "plain ffmpeg from PATH" design.

**Recommendation:** park it until the spike proves it will replace Remotion.
The transitions are a nice-to-have; the wgpu stage is the real milestone.

## 4. Scene QA: Moondream (MIT)

- **Moondream 2B** (MIT license) runs comfortably in 6 GB VRAM; the new
  **0.5B** variant runs on CPU alone. Cloud tier exists ($5/mo free credits) as
  a fallback but local is enough here.
- QA job for Clipflow: after `render-worker` finishes a clip, feed the cover
  frame + 3 sampled frames to Moondream with a fixed rubric prompt ("is any
  text cut off at the frame edge? is the subject centered? does anything look
  garbled?") and write the answers into the clip's QA record. Fails closed:
  QA is advisory — it never blocks a render, it flags clips for human review
  (same spirit as `qa-voice-timings.ts` for audio).

**Integration path (effort: small-medium).** `scripts/qa-scene-frames.ts`
reusing `qa-proof-series.ts`'s contact-sheet sampling + `moondream` Python
client or the ONNX weights through transformers.js (the PWA stack already has
onnxruntime-web). Advisory JSON beside the clip; no schema change needed.

## Pick order (value / effort)

1. **Moondream scene QA** — smallest effort, catches real regressions, local.
   (In progress: `scripts/qa-scene-frames.ts` + `moondream_qa.py`, venv at
   `remotion-studio/data/qa-venv`; CUDA graphs disabled — Kestrel's capture
   crashes on Turing.)
2. **Pexels + Pixabay stock** — ✅ shipped (`npm run stock:fetch`, commit
   6daf9ff); needs two free keys to activate, graceful skip without them.
3. **ACE-Step 1.5 beds** — one-off script, big production-value win per brand.
4. **GL Transitions via wgpu** — defer until the spike is a committed path.
