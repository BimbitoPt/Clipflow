# Clipflow native renderer

Rust CLI + library that renders vertical clips locally.

## Prerequisites

- Rust 1.96+
- Windows, macOS, or Linux
- NO system ffmpeg/ffprobe needed — the `ffmpeg-sidecar` crate
  auto-downloads a static ffmpeg binary on first run.

## Usage

```powershell
cargo run --manifest-path native/Cargo.toml -- render --idea "AI builds a site in 15 minutes, but creators still pay for sites that convert" --out ./exports
```

All flags (with defaults):

```powershell
cargo run --manifest-path native/Cargo.toml -- render --idea "..." --pack mstudio --voice on --out ./exports --models ../public/models
```

- `--idea` (required): video topic, truncated to 140 chars at a word boundary.
- `--pack` (default `mstudio`): script pack id (currently only `mstudio`).
- `--voice` (default `on`): `on | sapi | off` — see Voice below.
- `--out` (default `exports`): output directory (created if missing).
- `--models` (default `../public/models`): directory holding the local ONNX TTS weights.

Each run prints four output paths: `<slug>-916.mp4`, `<slug>-tiktok.txt`,
`<slug>-x.txt`, `<slug>-linkedin.txt`. Re-runs of the same idea overwrite
outputs; the slug is the first three alphanumeric words of the idea.

## Voice

- `on` — ort SpeechT5 default: synthesizes narration with the local ONNX
  SpeechT5 + HiFi-GAN weights under `--models` into a 16kHz mono WAV that is
  mixed into the MP4 as AAC audio.
- `sapi` — Windows-only System.Speech: synthesizes via PowerShell +
  `System.Speech` at 16kHz/16-bit/mono; errors on non-Windows targets
  (`sapi is Windows-only`).
- `off` — silent video, no audio stream: no TTS runs and the MP4 is rendered
  video-only (cue timing falls back to the 45s plan).

## Roadmap

Tauri v2 desktop app reusing this Rust core for local rendering, with the
existing React PWA as the frontend.
