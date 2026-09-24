# Clipflow SaaS — product concept

Status: thinking doc, 2026-09-16. Decided: web SaaS first, desktop later.

## Why the web app problems don't apply

Every browser failure this week was **client-side rendering**: WebCodecs
`AudioEncoder` quirks, CacheStorage poisoning, transformers.js CDN roulette,
vite SPA fallbacks. The SaaS renders **server-side**: the Rust core from
`native/` runs on our machines, the browser is UI + a `<video>` player.
No `VideoEncoder`, no model downloads, no AudioData — those code paths
cease to exist for users. The browser PWA stays as the free DIY tier;
paying users never touch it.

## Architecture (v1)

```
browser (React PWA, editor only) → API → render queue → Rust workers
→ object storage (assets in, mp4+txt out) → browser preview + download
```

- Queue: jobs table (user, idea, pack, voice, status, retries). One GPU-less
  box renders ~30 videos/hour; scale workers horizontally.
- Storage: stock pool + user uploads in, `mp4` + caption pack out.
- Billing: Stripe subscriptions + metered AI credits (see tiers).
- Determinism kept: same script engine, same golden tests, e2e gates
  (loudness floor, caption coverage, source diversity) run per deploy.

## Subscription tiers (draft)

| | Free (DIY) | Creator €19/mo | Studio €49/mo |
|---|---|---|---|
| Renders/mo | 5, 720p, watermark | 60, 1080p, no watermark | 200, 1080p + priority queue |
| Voices | 1 system voice | + 10 ElevenLabs voices | + voice cloning, all voices |
| B-roll | 31 stock pool | + 500 stock library | + Seedance AI b-roll gen |
| Captions | 1 style | 6 styles | custom brand kits |
| Extras | — | posting calendar | team seats, API, Managed upsell |

AI-heavy features (Seedance clips, ElevenLabs chars, cloning) meter on
top of base plans via credit packs — video/voice models are our highest
marginal cost and must never be flat-rate unlimited.

## AI integrations (metered)

- **Seedance (ByteDance)**: AI b-roll for cues the stock pool can't cover
  (true "code on screen", product mockups). Generated per cue, cached by
  prompt hash, pooled across users where licenses allow.
- **ElevenLabs**: voice library + cloning. Default tier voices stay
  system/OS (zero marginal cost); ElevenLabs chars draw from credits.
- Later: auto-reframe, hook A/B variants, thumbnail gen.

## Roadmap

1. SaaS v1: auth + Stripe + queue + Rust workers + 1080p + ElevenLabs.
2. Seedance b-roll + stock library expansion (verified-content tagging —
   lesson from the glasses/leopard incidents: every asset visually audited).
3. Team/API tier. 4. Tauri desktop reusing the Rust core (offline renders).

## Position

One engine, three doors: DIY (free PWA) → SaaS (self-serve subscription)
→ Managed (done-for-you €500 + €300/mo). Each tier feeds the next.
