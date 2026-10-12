# fframes spike (Phases 4 + 5)

Evaluates [fframes](https://github.com/dmtrKovalenko/fframes) as Clipflow's native
renderer. See `docs/fframes-study.md` §6–§7 for the findings this crate produced.

- **Phase 4 (renderer):** an SVG port of `src/lib/render.ts drawFrame` for one hook
  clip, driven by fframes' agent CLI (`timeline`, `inspect`, `strip`, `frame`,
  `onion`, `render`). Output is an in-process libav H.264 encode — no PNG pipe.
- **Phase 5 (batch):** `batch.exe` renders three 15s hook+cta cuts (mstudio + clipflow
  themes) sequentially, the role `remotion-studio/scripts/render-*.ts` fill today.
  `src/audio_mix.rs` is a number-pinned Rust port of `shared/audio-mix.ts` (7 tests).

## Prerequisites (Windows)

1. **Rust** 1.96+ (MSVC toolchain).
2. **FFmpeg 9 shared build** (already staged under `deps/ffmpeg/` — re-create with):

   ```powershell
   curl.exe -L -o ffmpeg.zip https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-n9.0-latest-win64-gpl-shared-9.0.zip
   Expand-Archive ffmpeg.zip deps\ffmpeg   # keep the inner folder's contents directly under deps\ffmpeg
   ```

3. **LLVM** for bindgen: `winget install LLVM.LLVM` (libclang.dll is loaded from
   `C:\Program Files\LLVM\bin`).

Codec cargo features (`h264`, `h265`, …) and `libav-agree-*` must stay **off**: they
force a from-source FFmpeg build, which is unsupported on Windows. The prebuilt GPL
build already ships libx264.

## Build & run

```powershell
$env:FFMPEG_DIR  = "$PWD\deps\ffmpeg"
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
$env:PATH        = "$env:FFMPEG_DIR\bin;$env:PATH"   # DLLs needed at build AND run time

cargo build --release
cargo test --release                                   # audio-mix pin tests

.\target\release\fframes-spike.exe timeline
.\target\release\fframes-spike.exe inspect --every 1s  # exit 2 on errors
.\target\release\fframes-spike.exe strip 0..45s -n 12  # -> strip.png
.\target\release\fframes-spike.exe render --draft      # 360x640 in ~3s
.\target\release\fframes-spike.exe render              # 720x1280, 45s clip ~8s
.\target\release\batch.exe                             # 3x15s clips -> out/
```

## Measured on the dev laptop (RTX-era Windows box, CPU tiny-skia backend)

| job | frames | wall | per frame |
|---|---|---|---|
| 45s 720×1280 `render` (draw + x264 encode) | 1350 | 7.7 s | **5.7 ms** |
| 45s `render --draft` (360×640) | 1350 | 3.3 s | 2.4 ms |
| batch: 3 × 15s 720×1280 | 1350 | 8.1 s | 6.0 ms |

Reference: the PWA `drawFrame()` bench (Phase 2, `scripts/video.mjs bench`) is
≈3.3 ms/frame **draw only** — no encode, no PNG/base64/IPC. The Tauri export path
adds all three per frame; fframes does none of them.

## Layout

```
src/lib.rs        media embedding (fonts: Segoe UI ×2, Consolas)
src/clip.rs       drawFrame SVG port, parameterized by cues + theme
src/audio_mix.rs  shared/audio-mix.ts port (cargo test pins the numbers)
src/main.rs       agent CLI (fframes::cli)
src/bin/batch.rs  Phase 5 batch renderer
media/            font files compiled into the binary
deps/ffmpeg/      BtbN FFmpeg 9.0 gpl shared (gitignored)
```
