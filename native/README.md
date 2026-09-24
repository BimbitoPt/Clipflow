# Clipflow native renderer

Rust CLI + library that renders vertical clips locally.

## Prerequisites

- Rust 1.96+
- Windows, macOS, or Linux
- NO system ffmpeg/ffprobe needed — the `ffmpeg-sidecar` crate
  auto-downloads a static ffmpeg binary on first run.
- Voice rendering needs the SpeechT5 and HiFi-GAN model files under
  `public/models` (about 215 MB); weights are local and are not stored in Git.
  Download the files from `Xenova/speecht5_tts` and `Xenova/speecht5_hifigan`
  on Hugging Face, keep each repository's directory layout, and put
  `speaker_embeddings.bin` at `public/models/speaker_embeddings.bin`.
  Silent rendering with `--voice off` does not need model weights.

## Usage

```powershell
cargo run --manifest-path native/Cargo.toml -- render --idea "AI builds a site in 15 minutes, but creators still pay for sites that convert" --out ./exports
```

All flags (with defaults):

```powershell
cargo run --manifest-path native/Cargo.toml -- render --idea "..." --pack mstudio --voice auto --out ./exports --models ../public/models
```

- `--idea` (required): video topic, truncated to 140 chars at a word boundary.
- `--pack` (default `mstudio`): script pack id (currently only `mstudio`).
- `--voice` (default `auto`): `auto | on | sapi | off` — see Voice below.
- `--out` (default `exports`): output directory (created if missing).
- `--models` (default `../public/models`): directory holding the local ONNX TTS weights.

Each run prints four output paths: `<slug>-916.mp4`, `<slug>-tiktok.txt`,
`<slug>-x.txt`, `<slug>-linkedin.txt`. Re-runs of the same idea overwrite
outputs; the slug is the first three alphanumeric words of the idea.

## Voice

- `auto` (default) — system voice on Windows (SAPI, best quality), ort
  SpeechT5 everywhere else.
- `on` — ort SpeechT5 everywhere: synthesizes narration with the local ONNX
  SpeechT5 + HiFi-GAN weights under `--models` into a 16kHz mono WAV that is
  mixed into the MP4 as AAC audio.
- `sapi` — Windows-only System.Speech: per-cue synthesis with real word onsets
  via PowerShell + `System.Speech` at 16kHz/16-bit/mono; errors on non-Windows
  targets (`sapi is Windows-only`).
- `off` — silent video, no audio stream: no TTS runs and the MP4 is rendered
  video-only (cue timing falls back to the 45s plan).

## Roadmap

Tauri v2 desktop app reusing this Rust core for local rendering, with the
existing React PWA as the frontend.
