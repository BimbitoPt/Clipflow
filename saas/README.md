# Clipflow SaaS

Next.js 14 + TypeScript + Tailwind + vitest

Commands: `npm install`, `npm test`, `npm run build`, `npm run dev`

## Quick start

1. `npm install`
2. Set `CLIPFLOW_DB` to an SQLite file path (defaults to `./data/clipflow.db` inside `saas/`; the directory is created and the schema from `db/schema.sql` is applied on first use).
3. `npm test` (fast suite: vitest, all mocked), `npm run slow` (real-render integration test), `npm run build`, `npm run dev`.
4. Health of the pipeline without auth: `curl -X POST http://localhost:3000/api/waitlist -H "Content-Type: application/json" -d "{\"email\":\"you@example.com\"}"`. Returns 200 `{ok:true}`, 409 on duplicate, 400 on invalid email.

## Auth

- Magic links sent with Resend (`RESEND_API_KEY`). From address is `onboarding@resend.dev` configured in `auth.ts`.
- Dev fallback: when `RESEND_API_KEY` is unset AND `NODE_ENV` is not `production`, the magic link URL is printed to the console instead of being sent; in production the send fails hard if the key is missing.
- Always set `AUTH_SECRET`, and set `NEXTAUTH_URL` (e.g. `http://localhost:3000` in dev).

## Billing

- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CREATOR` (Creator, $19/mo), `STRIPE_PRICE_STUDIO` (Studio, $49/mo). Free has no price.
- Local webhook testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, then set `STRIPE_WEBHOOK_SECRET` to the printed value.
- Quotas: Free 5 renders/month, Creator 60, Studio 200. When the quota is exhausted, the render route responds 402.
- AI features (ElevenLabs voice) spend credits from `credits_ledger`, separate from render quota.

## Renderer

- Build the native renderer once: `cargo build --release --manifest-path ../native/Cargo.toml` (worker expects `../native/target/release/clipflow.exe` on Windows, `clipflow` elsewhere; the exact path can be overridden with `CLIPFLOW_CLI`).
- Models directory: `../public/models` (passed to the CLI's `--models` flag; the CLI itself renders per its native CLI config/main.rs).
- ffmpeg is handled by the `ffmpeg-sidecar` crate in the native renderer, which auto-downloads the ffmpeg binary on first run.
- Run the worker: `CLIPFLOW_WORKER=1 npm run worker` (guard required; polls the job queue every 2s).
- Real-render integration test: `npm run slow` (runs `worker.render.test.ts` against the real CLI, skipped automatically if the binary is not built).

## Deploy

- App and API: Next.js on Vercel (or any Node host). All env via platform secrets/auth env vars.
- Render box: ONE machine runs the worker (`CLIPFLOW_WORKER=1 npm run worker`) and must have (a) the clipflow binary from `cargo build --release`, (b) the ffmpeg sidecar (auto-downloads on first render), (c) the model files synced to `saas/../public/models`.
- SQLite lives at `saas/data/clipflow.db`. For single-region deploy, mount that file on a persistent volume. Multi-region is not supported with SQLite; migrating to Postgres is a future task (tracked here in docs on purpose, not as code TODOs).

## Scope

- ElevenLabs is metered at 1 credit per 1000 characters of prompt text, charged before the fetch and refunded on fetch failure. Render failure after a valid fetch keeps the charge (documented seam, reconciliation task later).
- Seedance video generation has a provider seam: currently a mock (`MockSeedanceProvider` returns deterministic bytes derived from a sha256 of the prompt, wrapped in a filesystem cache). A real HTTP provider is pending external API docs and does not exist yet.
