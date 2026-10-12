# fframes study

**Date:** 2026-10-10 (phases 0–3) / 2026-10-11 (phases 4–5)
**Source:** [fframes](https://github.com/dmtrKovalenko/fframes) (MIT, ~2.5k★) /
[fframes.studio](https://fframes.studio/)
**Decision:** ideas adopted now (verification CLI, drawFrame perf, audio-mix model —
[plan](superpowers/plans/2026-10-10-fframes-verification-toolkit.md)); native renderer and
Remotion replacement spiked 2026-10-11 — results in §7.

---

## 1. What it is

A Rust framework for programmatic video. A video is a Rust struct implementing `Video` whose
`render_frame(frame) -> Svgr` returns an **SVG tree for every frame** (built with the `svgr!`
macro — SVG markup with `{rust expressions}`), animated by `timeline!` keyframes and springs,
encoded by **linked libav** (ffmpeg libraries linked into the process, not shelled out).
Positioned as the fast Remotion alternative (repo topics literally include `remotion`).

Pitch: *"video vibe coding framework that is actually fast"* — the launch video (128s) was
written by Codex in 48 minutes and rendered in 36 seconds.

## 2. How rendering works

- **`svgr!` proc-macro** compiles SVG-with-interpolation to an SVG tree. Subtrees whose markup
  contains **no `{}` get a compile-time static hash** and are cached across frames by the
  renderer — decoration stays lexically static, animation lives on a wrapping
  `<g transform={} opacity={}>`. This static-subtree caching is the core CPU optimization.
- **Two backends:**
  - CPU: tiny-skia, multi-threaded (default, no GPU needed).
  - GPU: Skia on Metal (macOS) / Vulkan (Linux, Windows) — walks the svgr tree directly,
    caches static subtrees as pictures, **~10× faster** than CPU at 1080p, and provides the
    real-time `preview` window.
- **Encoder negotiation** (`SkiaFrameExport::Auto`), fastest path first:
  1. hardware frames — encoder reads the texture Skia drew, **zero readback**
     (`h264_videotoolbox`, `h264_vulkan` when the driver supports Vulkan Video);
  2. GPU-side yuv conversion for common pixel formats, read back only the planes;
  3. RGBA readback + CPU conversion as fallback.
- **Encoding:** ffmpeg's libav linked statically/dynamically into the binary (not a
  subprocess); codec selection via cargo features (`h264`, `h265`, …).
- **Shaders:** SkSL or pasted Shadertoy GLSL can run as a layer of any frame on the Skia
  backend; pixels never leave the GPU.
- **Media:** `include_media_dir!` compiles fonts/audio/images into the binary; fonts measured
  from font files so text layout is deterministic (`text_width`, `text_fit`,
  `text_break_lines`).

## 3. The agent-first CLI (the part Clipflow wants)

> "Built for an author that cannot watch." — a coding agent cannot watch a video or hear a
> soundtrack, so every project turns the video into things an agent can **read**: PNGs, text
> and numbers.

Every generated project gets `fframes::cli`; all commands run as
`cargo run --release -- <command>`:

| command | output |
|---|---|
| `timeline` | scenes with frame/second ranges, audio tracks + mix settings |
| `inspect [RANGE] [--every 0.25s]` | checks a frame without rendering pixels: missing fonts/images, text cut off by the canvas edge, invalid SVG, NaN transforms, panics — each with time + scene; **exit 2 on errors**; `--json` |
| `strip <range> -n 12` | one labelled contact sheet PNG — judge layout/rhythm/motion fast |
| `frame <times>` | full-size PNGs for typography/alignment checks |
| `onion <range> -n 6` | frames blended into one image — shows movement path, easing, overshoot |
| `svg <time>` | the frame's final SVG as text |
| `snapshot <times>` | diff vs approved PNGs (`.diff.png` marks changes) |
| `audio analyze [--waveform]` | loudness (LUFS), true peak, clipping, silence, per-scene loudness + waveform PNG |
| `audio at <times>` | which sounds play at a moment and at what level |
| `preview [TIME]` | real-time GPU window with sound, for the human |
| `render [--draft]` | the video; `--draft` = one scene at half size in ~1s |

**Conventions worth copying:** time syntax (`120` frame, `3.2s`, `50%`, `hook@50%`, ranges
`a..b`), `--json` on stdout with progress on stderr, exit code 2 on errors, inspect runs
**without rendering pixels** where possible.

**Workflow rules (from their skill):** do not render the whole video to review a change —
`timeline` → `inspect` → `strip` → `frame` → `preview` at the changed second; look at PNGs
before saying anything looks good; validate with numbers, not watching.

## 4. Motion, scenes, audio

- `timeline!` keyframes: `at 0., animate Transform::translate(..) => .., Easing::Spring{..}`;
  springs settle on their own. Built once, sampled per frame — deterministic, no browser/DOM.
- Scenes are structs with `Duration::Auto`, `Overlap::Previous(0.4)` crossfades.
- **`AudioMap`** is a real mixer: per track `gain_db`, `fade_in/out`, `pan`, `offset`,
  `duck_under_voice()` (−12 dB while any `.voice()` track plays, ramped), master **−1 dBFS
  lookahead limiter**, sinc resample, 5 ms de-click fades on cuts. Verified numerically with
  `audio analyze` — target **≈ −14 LUFS integrated, true peak < −1 dBTP** for web video.

## 5. Packaging / distribution

- **Skill-first DX:** ships as an agent skill — `npx skills add https://fframes.studio` —
  with plain-Markdown guides (workflow, API cheat sheet, design, sound) that are worth
  reading as a human.
- `cargo fframes new` scaffolds a project that renders as generated; `--yes` for agents.
- Editor: the video compiled to **WebAssembly** + ReScript/React timeline editor for
  interactive scrubbing; `preview` window for watching.
- Explicit/verbose API is deliberate: *"writing explicit, verbose code is exactly what an
  agent with the right skill is good at."*

## 6. Fit with Clipflow

| Clipflow surface | Fit |
|---|---|
| DIY PWA (`src/`, Canvas + WebCodecs) | **No** — local-first browser constraint; fframes is native (WASM only powers its editor preview). Keep Canvas/WebCodecs. |
| Agent verification | **Yes — Phase 1.** Clipflow is agent-driven but has no way for an agent to "see" a render. Borrow the CLI shape over the existing `drawFrame()`. |
| `drawFrame()` perf | **Yes — Phase 2.** fframes' static-caching philosophy maps to memoizing constant per-frame work and caching time-invariant layers. |
| Audio | **Yes — Phase 3.** `AudioMap` model (ducking/fades/limiter/LUFS) is exactly the music-mixing work already on the desktop roadmap (docs/desktop-app-direction.md). |
| `native/` Rust CLI + SaaS worker | **Spiked (Phase 4, §7).** Build friction solved (shared FFmpeg 9 + LLVM, no Skia); SVG port of `drawFrame` renders at 5.7 ms/frame incl. encode. Go for one production composition. |
| Tauri desktop export | **Spiked (Phase 4, §7).** fframes' in-process render+encode structurally removes the base64-PNG IPC pipe (docs/native-desktop.md:40). |
| Remotion batch studio | **Spiked (Phase 5, §7).** 3×15s batch in 8.1s from one static binary; shared audio-mix numbers pinned Rust↔TS. Full A/B vs the actual compositions still open. |

**Windows friction for Phase 4:** fframes on Windows links a *shared* FFmpeg 9 build
(BtbN) + needs LLVM/libclang for bindgen; codec cargo features that build ffmpeg from source
are unsupported on Windows; first Skia build compiles from source (~20 min). Clipflow's
bundled single-exe `ffmpeg.exe` will not link — a shared build would be staged instead.
*(Resolved 2026-10-11 — see §7: built with `deps/ffmpeg` BtbN shared build + LLVM 23,
default CPU backend, zero Skia build; codec/license cargo features must stay OFF or the
build script forces a from-source FFmpeg compile on Windows.)*

## 7. Future phases — executed (2026-10-11)

Crate: `native/fframes-spike/` (self-contained; README has build steps). Not wired into
any product path — evaluation only.

### Phase 4 — fframes as native renderer: **build GO, port PARTIAL-GO**

- **Build on Windows: GO.** BtbN `ffmpeg-n9.0-*-gpl-shared` staged in `deps/ffmpeg` +
  LLVM 23 (winget). Gotcha: `libav-agree-*`/codec cargo features force a from-source
  FFmpeg build (unsupported on Windows) — keep only `cli`. Default CPU backend (tiny-skia)
  means **no Skia build at all** (~45 s first build). DLLs must be on PATH at build *and*
  run time.
- **SVG port of one clip: GO.** `src/clip.rs` ports `drawFrame` (gradient bg, rotating
  rays, hook card with shrink-to-fit, phrase caption, edge dip, motion bar, progress bar,
  end card) parameterized by cues + pack theme. Fonts must be *files* in `media/`
  (Segoe UI ×2, Consolas) compiled in — no system-font lookup.
- **Agent CLI: works as documented.** `timeline`, `inspect --every 1s`, `strip`, `frame`,
  `onion`, `render [--draft]` with `--json` and exit 2. inspect earned its keep in the
  first run: caught **zero-width rects** (SVG-invalid where canvas silently tolerates —
  fixed with a 0.5px floor) and a **missing font-family**; it also reports the fallback
  caption overflowing the bottom edge on long cues — a *pre-existing drawFrame quirk*
  faithfully reproduced (the real pipeline's 2-line caption plans avoid it).
- **Speed: GO.** 45 s / 1350 frames at 720×1280 draws **and encodes in 7.7 s
  (5.7 ms/frame)** on the CPU backend, draft 3.3 s. Phase 2's canvas bench is ≈3.3 ms/frame
  *draw only*; the Tauri desktop path then pays PNG encode + base64 + IPC per frame on top
  (docs/native-desktop.md calls it "agreement over speed"). fframes replaces that whole
  pipe with in-process rendering + libav. GPU/Skia backend (10× claim) is a later unlock.
- **Parity: visual, not pixel.** tiny-skia rasterizes; text metrics come from the font
  files rather than the browser's system-ui shaping, so layouts land close but not
  pixel-identical. A port means accepting fframes' own text fitting as the new source.

### Phase 5 — Remotion studio replacement: **structural GO, full A/B pending**

- **`src/bin/batch.rs` renders 3 × 15 s cuts (mstudio + clipflow themes) in 8.1 s
  total (6 ms/frame)** — sequential batch, per-clip timing, one static binary: no Node,
  no Chromium, no Next bundle, no `selectComposition` round-trip. That is the role
  `remotion-studio/scripts/render-*.ts` fill today.
- **Shared policy inputs: GO.** `src/audio_mix.rs` is a Rust port of
  `shared/audio-mix.ts` (VO fit/gain, ducking 0.055/0.18 + 0.12/0.26 @ 0.15 lead, SFX
  gains, loudnorm/ambient/music-bed/limiter chains); **7 `cargo test`s pin the exact
  TS numbers and filter-graph strings**. This is the cross-language policy channel the
  ports already use (`shared/` for TS, `native/packs/*.json` for the CLI) — audio-mix
  would move to JSON next if the port graduates.
- **Not done (needs a real A/B session):** rendering the actual remotion-studio
  compositions for side-by-side timing (requires the Next bundle + Chromium +
  Kokoro voice assets), audio muxing in the fframes batch (`AudioMap` is wired but the
  spike renders silent), and motion-graphics/scene parity for the full cue vocabulary.

- **Idea (still open):** ship a Clipflow agent skill in the fframes distribution style
  (`npx skills add` style) — Phase 1's CLI already is the skill's tooling.

### Decision

Ideas + verification CLI + audio model shipped (Phases 0–3); fframes **wins the
native-renderer spike** on build friction, agent tooling and end-to-end speed. Next
step when authorized: one production composition ported to fframes and rendered
side-by-side with the Tauri export path (frames + wall time + file size), before any
renderer fork is committed to.

## 8. What Clipflow is borrowing (this plan)

1. **Verification CLI** → `node scripts/video.mjs <cmd>` (`timeline`, `inspect`, `strip`,
   `frame`, `onion`, `audio analyze`, `bench`) — plan §Phase 1.
2. **Perf discipline** → bench first, memo constant work, gate any cache on pixel parity —
   plan §Phase 2.
3. **Audio-mix model** → `shared/audio-mix.ts` with ducking/fades/limiter, verified by
   `audio analyze` — plan §Phase 3.

Not borrowed (for now): Skia/GPU backend, WASM editor, snapshot tests, skill packaging.
Borrowed as a spike (§7): the Rust renderer itself — `native/fframes-spike/`.
