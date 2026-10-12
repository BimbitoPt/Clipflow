# Clipflow ship plan — $0 path to first users

Constraint: zero spend. Everything below is free-tier or self-built.
Anything costing money is marked PAYWALLED with the free workaround.

## Where we stand (audited 2026-10-08)

- **Web/PWA** (`src/`, `vite-plugin-pwa`): the working product. Script →
  keyframes (`gen.pollinations.ai`, z-image-turbo, quest Pollen) → offline
  AI pool fallback → canvas preview → MP4 export. `dist/` builds.
- **Desktop** (`src-tauri/`): Tauri v2, Windows NSIS only, unsigned, no
  updater. Release `.exe` + NSIS setup already build. macOS/Linux/mobile:
  nothing.
- **SaaS** (`saas/`): Next.js 14, Resend magic-link auth (real), SQLite
  (`better-sqlite3`, no migrations — `CREATE TABLE IF NOT EXISTS`),
  Stripe checkout+webhooks wired but unprovisioned, single-process render
  worker needing the native CLI binary, no job status/download API.
- **Native CLI** (`native/`): Rust renderer (needs `cargo build --release`
  + ffmpeg-sidecar download + model files).

## Hard truths (money)

| Want | Cost | $0 workaround |
|---|---|---|
| Apple App Store listing | $99/yr PAYWALLED | PWA install (free, no store) |
| Google Play listing | $25 one-time PAYWALLED | PWA install / direct APK later |
| Windows code signing (no SmartScreen warning) | cert PAYWALLED | Unsigned NSIS + "More info → Run" notice |
| Custom email domain | Resend domain (free tier OK) | `onboarding@resend.dev` works |
| Always-on SaaS host | VPS costs | Free-tier VM (Oracle/Fly free allowance) or home server; single-host SQLite design already assumes one box |

## Phase 0 — PWA mobile (free, days)
Goal: installable, offline-tolerant phone experience. No stores.
- `manifest` icons/maskable, theme-color, screenshots.
- Offline: keyframe/OPFS caches already local; verify export works offline
  after first load (anonymous Pollinations needs net — document it).
- Mobile Chrome smoke test (per `docs/teardown.md:61` note).
- Exit: phone install prompt + full video flow on mobile Chrome.

## Phase 1 — SaaS to first users (free, 1–2 weeks)
Goal: strangers can sign up, render, download. Single free-tier host.
1. Auth polish: `AUTH_SECRET`, `RESEND_API_KEY`, `NEXTAUTH_URL`; keep
   `onboarding@resend.dev` sender; rate-limit waitlist route.
2. Job read API: `GET /api/jobs` (status/list) + file download route —
   currently POST-only, outputs are filesystem-only.
3. Worker deploy checklist: build native CLI, ffmpeg-sidecar, model sync,
   `CLIPFLOW_WORKER=1`, persistent volume for `data/` + `storage/`.
4. Quota UX: surface `402 quota` + free 5/month in UI (logic exists).
5. Stripe: leave unprovisioned (blocked on keys); free tier is the product.
6. Exit: 5 friendly users render end-to-end on the hosted URL.

## Phase 2 — Desktop hardening (free, days)
Goal: trustworthy Windows installer without paying for certs.
- Keep unsigned NSIS; add SmartScreen notice in landing/docs.
- `tauri-plugin-updater` with free static release feed (GitHub releases).
- Add `dmg`/`appimage` targets (build-only, unsigned) if time permits.
- Exit: versioned installer + auto-update on Windows.

## Phase 3 — Backend for keyframes ($0 infra)
Goal: replace the solo-local `sk_` override with proper architecture.
- Free-tier Cloudflare Worker proxy holding the secret; browser keeps
  using `pk_` safe params. Or full BYOP OAuth (app key already has
  `localhost/callback` + 20% earnings on).
- Exit: no secret in any bundle; users spend own pollen; earnings flow.

## Phase 4 — Stores (only with revenue)
- Apple $99/yr, Play $25, signing certs — fund from Phase 1–3 earnings.
- Until then: PWA is the mobile app.

## Non-goals until revenue
Paid TTS (disabled by design), Seedance real provider, multi-region,
Postgres migration, native mobile wrappers.
