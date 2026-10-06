# Clipflow — one engine, two doors

Clipflow is one engine with two doors:

- **Clipflow (DIY)** — free, local-first PWA. No server, no keys, no auto-post.
- **Clipflow Managed** — done-for-you short-form by MSTUDIO. See `docs/clipflow-saas.md`.

DIY is the default. Managed is the upgrade. Same engine, same loop.

## DIY loop

1. Pick a niche profile (`src/packs/*.json`) — voice, hooks, CTAs.
2. Generate a deterministic script — hook + 3 beats + CTA, no AI calls.
3. Render 720p vertical video locally — Canvas + WebCodecs, word-level captions.
4. Copy out TikTok / X / LinkedIn captions — paste and post natively.

## Constraints (DIY v1)

- Local-first: video renders on-device, assets in `public/broll/`.
- No server, no API keys, no auto-post — export `.mp4` + `.txt`, post yourself.
- Unlimited drafts, clean 720p free forever — see `docs/teardown.md` for why.

## Docs

### Windows desktop

Clipflow also has a Tauri desktop application with native media import, portable project files, and local FFmpeg export. The editor shares its scene, motion, and caption renderer with the browser version.

```powershell
npm run desktop:dev
npm run desktop:build
```

See [the desktop guide](docs/native-desktop.md) for packaging prerequisites, project files, and first-release limits.

- `docs/clipflow-saas.md` — Clipflow SaaS direction and operating plan.
- `docs/teardown.md` — competitive teardown feeding DIY positioning.
- `docs/dogfood.md` — DIY dogfood validation (3 MSTUDIO ideas).
- `docs/broll.md` — DIY local starter assets.
