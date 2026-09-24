# Clipflow SaaS + Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Next.js web SaaS (landing + auth + Stripe subscriptions + server-side video render pipeline) in `saas/`, rendering with the existing Rust CLI on the server — the browser never encodes, never downloads models.

**Architecture:** Next.js App Router (TS + Tailwind) hosts landing, app UI, and API routes. SQLite (`better-sqlite3`, file at `saas/data/clipflow.db`, Postgres migration path documented but out of scope) stores users/subscriptions/credits/jobs. A separate `npm run worker` process polls `jobs` and shells `native/target/release/clipflow`. Billing via Stripe Checkout + webhooks; AI features (ElevenLabs, Seedance) meter credits.

**Tech Stack:** Next.js 14 (App Router), TypeScript 5, Tailwind CSS, Auth.js v5 (Resend magic links), Stripe (`stripe` npm + Stripe CLI for webhooks), `better-sqlite3`, Rust CLI at `native/` (prebuilt via `cargo build --release`), vitest (same as repo root).

## Global Constraints

- All new code under `saas/`; do not modify `src/`, `native/`, `public/`, `exports/`, `brand/` (brand assets are COPIED into `saas/public/brand/`, never moved).
- Brand tokens frozen from `brand/branding.md`: bg `#080A0D`, blue `#246BFD`, lime `#CFFF47`, off-white `#F7F8FA`; tagline `idea in, video out.`; voice direct/confident/zero fluff, no em-dashes in user-facing copy.
- Tiers frozen from `docs/clipflow-saas.md`: Free = 5 renders/mo 720p watermark; Creator €19 = 60/mo 1080p; Studio €49 = 200/mo + priority. AI features always draw credits, never flat-rate.
- Secrets only via env (`RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`, `SEEDANCE_API_KEY`); dev fallbacks (console-log magic link, Stripe CLI) must never touch prod keys. Never commit `.env*` (repo `.gitignore` already covers `*.local`; add `saas/.env*` + `saas/data/` explicitly in Task A1).
- DRY, YAGNI, TDD, frequent commits (`git add saas/<files>` only).

---

# Part A — Landing + waitlist (ships alone)

### Task A1: Scaffold Next.js app + brand system

**Files:**
- Create: `saas/package.json`, `saas/tsconfig.json`, `saas/next.config.mjs`, `saas/tailwind.config.ts`, `saas/postcss.config.mjs`, `saas/app/layout.tsx`, `saas/app/globals.css`, `saas/app/page.tsx` (stub), `saas/.gitignore`
- Create: `saas/public/brand/logo.svg`, `saas/public/brand/avatar.svg` (byte copies of `brand/logo.svg`, `brand/avatar.svg`)
- Test: `saas/vitest.config.ts` + `saas/lib/brand.test.ts` (asserts token constants)

**Interfaces:**
- Consumes: `brand/branding.md` (tokens), repo vitest pattern
- Produces: `saas/lib/brand.ts` exporting `export const BRAND = { bg: "#080A0D", blue: "#246BFD", lime: "#CFFF47", ink: "#F7F8FA", tagline: "idea in, video out." } as const;`

- [ ] **Step 1: Write the failing test**

```ts
// saas/lib/brand.test.ts
import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";

describe("brand", () => {
  it("freezes the Clipflow tokens", () => {
    expect(BRAND.bg).toBe("#080A0D");
    expect(BRAND.blue).toBe("#246BFD");
    expect(BRAND.lime).toBe("#CFFF47");
    expect(BRAND.tagline).toBe("idea in, video out.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix saas test -- lib/brand.test.ts` (add `"test": "vitest run"` plus dev dep `vitest` via `npm --prefix saas install -D vitest` to `saas/package.json` in this task)
Expected: FAIL (no saas/ tree yet — scaffold first to red-state if needed, then implement)

- [ ] **Step 3: Write minimal implementation**

Scaffold: `npx create-next-app@14 saas --typescript --tailwind --app --no-src-dir` (needs network; if blocked, hand-create the 8 files above with Next 14 defaults). Then `saas/lib/brand.ts` with BRAND const. `saas/.gitignore`: `node_modules/`, `.next/`, `.env*`, `data/`, `storage/`. `globals.css`: dark bg + system font stack. `layout.tsx`: metadata title `Clipflow — idea in, video out`, dark background. Copy the two SVGs byte-for-byte.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix saas test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add saas/
git commit -m "feat(saas): scaffold Next.js app with brand system"
```

### Task A2: Hero + demo video + pillars section

**Files:**
- Modify: `saas/app/page.tsx`
- Create: `saas/components/Hero.tsx`, `saas/components/Pillars.tsx`
- Create: `saas/public/demo.mp4` (byte copy of `exports/mstudio-sync-916.mp4` — build artifact snapshot; if missing on a fresh clone, regenerate via the Rust CLI: `cargo run --manifest-path native/Cargo.toml -- render --idea "..." --out ./saas/public --models ./public/models` then rename to `demo.mp4`)
- Test: `saas/components/Hero.test.tsx`? NO — UI smoke via `next build` only (vitest DOM not configured; keep to build gate)

**Interfaces:**
- Consumes: BRAND, logo.svg, demo.mp4
- Produces: landing `/` rendering hero (H1 `Idea in, video out.`, sub from `brand/branding.md` LinkedIn tagline, CTA buttons `Join the waitlist` → `#waitlist` + `Watch demo` scrolling to `<video src="/demo.mp4" controls>`), pillars grid (5 pillars from `brand/branding.md`, name + one-liner each)

- [ ] **Step 1: Write the page skeleton test** — skip unit test per above; verification = build.
- [ ] **Step 2: Implement Hero + Pillars + page** with Tailwind classes using BRAND hexes inline (no em-dashes in copy — reuse branding.md wording verbatim).
- [ ] **Step 3: Run `npm --prefix saas run build`** Expected: clean build, `/` route present.
- [ ] **Step 4: Commit**

```bash
git add saas/app saas/components saas/public/demo.mp4
git commit -m "feat(saas): landing hero with demo video and pillars"
```

### Task A3: Pricing + FAQ + footer

**Files:**
- Modify: `saas/app/page.tsx`
- Create: `saas/components/Pricing.tsx`, `saas/components/Faq.tsx`, `saas/components/Footer.tsx`
- Test: build gate only

**Interfaces:**
- Consumes: tier table from `docs/clipflow-saas.md` (Free/Creator €19/Studio €49 + feature rows verbatim, credits footnote: "AI voices and AI b-roll draw credits on all plans")
- Produces: `#pricing` 3-card grid (Studio highlighted lime), `#faq` (4 Q&As: what is Clipflow / do I install anything / who owns the videos / cancel anytime), footer (© 2026 Clipflow, MSTUDIO link `https://mstudioweb.pt`, social placeholders `https://x.com/clipflowapp` etc. marked `href="#"` with `aria-label` until handles claimed)

- [ ] **Step 1: Implement three components + wire into page.**
- [ ] **Step 2: Run `npm --prefix saas run build`** Expected: clean build.
- [ ] **Step 3: Commit**

```bash
git add saas/app saas/components
git commit -m "feat(saas): pricing, FAQ, footer"
```

### Task A4: Waitlist form + API + table

**Files:**
- Create: `saas/lib/db.ts`, `saas/lib/waitlist.ts`, `saas/db/schema.sql`, `saas/app/api/waitlist/route.ts`, `saas/components/Waitlist.tsx`
- Modify: `saas/app/page.tsx` (mount `<Waitlist/>` at `#waitlist`), `saas/package.json` (add deps: run `npm --prefix saas install -S better-sqlite3` + dev `npm --prefix saas install -D @types/better-sqlite3`)
- Test: `saas/lib/waitlist.test.ts` + `saas/app/api/waitlist/route.test.ts` (POST handler with mocked db)

**Interfaces:**
- Consumes: `saas/lib/db.ts` `export function getDb(): Database` (better-sqlite3, file `saas/data/clipflow.db`, WAL mode, runs `schema.sql` on first open)
- Produces: `POST /api/waitlist {email} -> {ok:true}` (validates RFC-5322-loose regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, 409 on duplicate); `waitlist(email TEXT PRIMARY KEY, created_at TEXT)` table

- [ ] **Step 1: Write the failing tests**

```ts
// saas/lib/waitlist.test.ts
import { describe, expect, it } from "vitest";
import { joinWaitlist, isWaitlisted } from "./waitlist";

describe("waitlist", () => {
  it("accepts a valid email once, rejects duplicates and garbage", () => {
    const db = freshTestDb();
    expect(joinWaitlist(db, "a@b.co")).toEqual({ ok: true });
    expect(joinWaitlist(db, "a@b.co")).toEqual({ ok: false, reason: "duplicate" });
    expect(joinWaitlist(db, "not-an-email")).toEqual({ ok: false, reason: "invalid" });
    expect(isWaitlisted(db, "a@b.co")).toBe(true);
  });
});
```

(`saas/lib/waitlist.ts` with `joinWaitlist/isWaitlisted/freshTestDb(:memory:)` — create it in this task.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix saas test -- lib/waitlist.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

`schema.sql`: `CREATE TABLE IF NOT EXISTS waitlist(email TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')));` `db.ts`: singleton per path (env `CLIPFLOW_DB` or `saas/data/clipflow.db`), `PRAGMA journal_mode=WAL`. Route: parse JSON, validate, 200 `{ok:true}` / 409 `{ok:false,reason}` / 400 invalid. Component: email input + button, posts JSON, shows success/error copy (no em-dashes).

- [ ] **Step 4: Run tests + build**

Run: `npm --prefix saas test` then `npm --prefix saas run build`
Expected: PASS + clean build

- [ ] **Step 5: Commit**

```bash
git add saas/lib saas/db saas/app saas/components
git commit -m "feat(saas): waitlist with API and tests"
```

---

# Part B — Auth + billing (ships on top of A)

### Task B1: Auth.js magic links

**Files:**
- Create: `saas/auth.ts`, `saas/app/api/auth/[...nextauth]/route.ts`, `saas/components/SignIn.tsx`
- Modify: `saas/db/schema.sql` (append Auth.js tables: users, accounts, sessions, verification_tokens — exact Auth.js v5 SQLite schema), `saas/.env.example` (`RESEND_API_KEY=`, `AUTH_SECRET=`, `NEXTAUTH_URL=http://localhost:3000`)
- Modify: `saas/package.json` (add deps FIRST: run `npm --prefix saas install -S next-auth@5 resend`; Auth.js v5 ships as the `next-auth@5` npm tag)
- Test: `saas/lib/auth.test.ts` (session callback attaches `user.id`; sign-in email allow-list? none — open waitlist-gated: any email may sign in, quota enforced at render)

**Interfaces:**
- Consumes: `getDb()` from Task A4
- Produces: `export const { handlers, auth, signIn, signOut } = NextAuth({...Resend provider, adapter: SQLite...})`; `SignIn` button component

- [ ] Steps 1-5 (TDD): failing session-callback test → FAIL → implement `auth.ts` (Resend provider; dev fallback: if no `RESEND_API_KEY`, `sendVerificationRequest` logs the URL via `console.log` and returns — document in README, never in prod) → PASS → build → commit `feat(saas): magic-link auth`.

### Task B2: Stripe subscriptions + webhook

**Files:**
- Create: `saas/lib/billing.ts`, `saas/app/api/checkout/route.ts`, `saas/app/api/webhooks/stripe/route.ts`, `saas/components/Upgrade.tsx`
- Modify: `saas/package.json` (add dep FIRST: run `npm --prefix saas install -S stripe`), `saas/db/schema.sql` (append `subscriptions(user_email TEXT PRIMARY KEY, tier TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT)`), `saas/.env.example` (add `STRIPE_SECRET_KEY=`, `STRIPE_WEBHOOK_SECRET=`, `STRIPE_PRICE_CREATOR=`, `STRIPE_PRICE_STUDIO=`)
- Test: `saas/lib/billing.test.ts` (tier resolution: `tierFor(email)` reads subscriptions, defaults `free`; webhook payload construction tested with Stripe test signature helper `stripe.webhooks.generateTestHeaderString`)

**Interfaces:**
- Consumes: `auth()` session, `getDb()`
- Produces: `POST /api/checkout {tier: "creator"|"studio"} -> {url}` (Stripe Checkout Session, mode subscription, success/cancel URLs); webhook handler verifies signature via `stripe.webhooks.constructEvent`, upserts subscriptions on `checkout.session.completed` + `customer.subscription.updated/deleted`; `tierFor(email): "free"|"creator"|"studio"`; `Upgrade` buttons posting to checkout

- [ ] Steps 1-5 (TDD): failing tier/webhook tests → FAIL → implement → PASS (webhook test uses `stripe` test helpers, no network) → build → local verify with `stripe listen --forward-to localhost:3000/api/webhooks/stripe` documented in commit message body → commit `feat(saas): Stripe subscriptions`.

### Task B3: Credits ledger + quota gating

**Files:**
- Create: `saas/lib/credits.ts`
- Modify: `saas/db/schema.sql` (append `renders(user_email TEXT, created_at TEXT)`, `credits_ledger(user_email TEXT, delta INTEGER, reason TEXT, created_at TEXT)`)
- Test: `saas/lib/credits.test.ts`

**Interfaces:**
- Consumes: `tierFor()` from Task B2
- Produces: `quotaFor(tier): {renders: 5|60|200}`; `rendersUsedThisMonth(db,email): number`; `canRender(db,email): boolean`; `spendCredits(db,email,amount,reason)` (balance may not go negative → returns false); `grantCredits(db,email,amount,reason)`; helper `monthKey(): "YYYY-MM"`

- [ ] Steps 1-5 (TDD): failing quota/ledger tests (free 5/mo resets across month boundary via injected clock — pass `now: Date` param, no fake timers) → FAIL → implement → PASS → commit `feat(saas): credits ledger and quotas`.

---

# Part C — Server render pipeline (ships on top of B)

### Task C1: Jobs table + enqueue API + worker skeleton

**Files:**
- Create: `saas/lib/jobs.ts`, `saas/app/api/jobs/route.ts`, `saas/worker.ts`
- Modify: `saas/db/schema.sql` (append `jobs(id INTEGER PRIMARY KEY, user_email TEXT, idea TEXT, voice TEXT DEFAULT 'auto', status TEXT DEFAULT 'queued', out_path TEXT, error TEXT, created_at TEXT, updated_at TEXT)`), `saas/package.json` (add `"worker": "tsx worker.ts"` + dev dep `tsx`)
- Test: `saas/lib/jobs.test.ts` + `saas/app/api/jobs/route.test.ts`

**Interfaces:**
- Consumes: `auth()`, `canRender()` from Task B3, `getDb()`
- Produces: `POST /api/jobs {idea, voice?} -> {id}` (401 unauthenticated, 402 over quota, 400 empty idea); `enqueue(db,email,idea,voice): id`; `claimNextJob(db): row|null` (atomic UPDATE queued→running WHERE id); worker loop: poll every 2s, claim, mark `done`/`failed` (render itself mocked in this task: writes `{id}.txt` placeholder, marks done)

- [ ] Steps 1-5 (TDD): failing enqueue/claim/quota tests → FAIL → implement (route + lib + worker skeleton with mock render) → PASS → commit `feat(saas): render job queue`.

### Task C2: Wire the real Rust CLI

**Files:**
- Modify: `saas/worker.ts` (replace mock with CLI spawn), `saas/README.md` (prereqs: `cargo build --release` in `native/`, ffmpeg sidecar auto-downloads)
- Test: `saas/worker.render.test.ts` (spawns worker once with `CLIPFLOW_TEST_MODE=1` against tmp out dir, asserts mp4 exists via file size > 0 — slow, `vitest run --testTimeout=600000`, single test)

**Interfaces:**
- Consumes: `native/target/release/clipflow` (built via `cargo build --release --manifest-path native/Cargo.toml` — document, do not vendor the binary); job rows from Task C1
- Produces: worker spawns `clipflow render --idea {idea} --voice {voice} --out {storage/jobs/{id}} --models {repo}/public/models`, parses the 4 printed paths from stdout, sets `out_path` + status done (non-zero exit → failed + stderr tail in `error`)

- [ ] Steps 1-5 (TDD): failing worker test → FAIL → implement spawn+parse → PASS (slow) → commit `feat(saas): wire Rust CLI renderer`.

### Task C3: ElevenLabs voices (metered)

**Files:**
- Create: `saas/lib/eleven.ts`
- Modify: `saas/worker.ts` (voice names starting `eleven:` fetch-then-render), `saas/.env.example` (add `ELEVENLABS_API_KEY=`)
- Test: `saas/lib/eleven.test.ts` (mocked global fetch)

**Interfaces:**
- Consumes: `spendCredits()` from Task B3 (cost: 1 credit per 1000 chars, round up — frozen rule)
- Produces: `elevenTts(apiKey, voiceId, text): Buffer` (POST `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}`, headers `xi-api-key` + `Content-Type: application/json`, body `{text, model_id: "eleven_multilingual_v2"}`; throws on non-2xx with status in message); worker: `eleven:{voiceId}` voices synthesize to `{tmp}.eleven.wav`, billed before synth (insufficient → job failed with `insufficient_credits`), wav passed to render as the voice track (reuse Job wav input — render accepts any wav path)

- [ ] Steps 1-5 (TDD): failing mock-fetch test (assert URL/header/body + Buffer return + non-2xx throw) → FAIL → implement → PASS → commit `feat(saas): ElevenLabs voices with credit metering`.

### Task C4: Seedance provider seam (mock-first)

**Files:**
- Create: `saas/lib/seedance.ts`
- Test: `saas/lib/seedance.test.ts` (mock provider: prompt hash → deterministic fixture mp4 bytes; cache-hit returns same bytes without calling provider)

**Interfaces:**
- Consumes: nothing (standalone seam)
- Produces: `SeedanceProvider { generate(prompt: string): Promise<Buffer> }`, `MockSeedanceProvider` (test double), `promptHash(prompt): string` (sha256 hex), file cache under `saas/storage/seedance/{hash}.mp4` with hit/miss logging. Real API wiring is EXPLICITLY OUT OF SCOPE: when the key is provisioned, a follow-up task implements `HttpSeedanceProvider` against the live docs; if the live API shape differs from `{generate(prompt)->mp4 bytes}`, STOP and report (escape hatch, do not improvise). This task ships the seam + cache + tests only.

- [ ] Steps 1-5 (TDD): failing cache/provider tests → FAIL → implement → PASS → commit `feat(saas): Seedance provider seam with mock`.

### Task C5: E2E + README + deploy notes

**Files:**
- Create: `saas/README.md` (setup, env, Stripe CLI, worker, deploy to Vercel + one render box, cron for queue? no — worker is a process, document systemd/Docker later)
- Test: `saas/e2e/lifecycle.test.ts` (auth stub → waitlist → checkout mock → enqueue → worker mock-render → done; all external calls mocked; asserts status transitions queued→running→done)

- [ ] Steps 1-5: failing lifecycle test → FAIL → implement missing glue (if any — mostly asserts existing wiring) → PASS → full `npm --prefix saas test` + `next build` green → commit `docs(saas): e2e lifecycle and ops README`.
