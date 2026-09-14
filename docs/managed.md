# Clipflow (DIY) / Clipflow Managed — one engine, two doors

> Clipflow is one engine with two doors: **Clipflow (DIY)** — free, local-first PWA you run yourself — and **Clipflow Managed** — done-for-you short-form by MSTUDIO. This file covers the Managed side only (weekly operator loop runbook).

## 1. Positioning

Clipflow is one engine with two doors. DIY is the default. Managed is the upgrade. Same engine, same loop.

- **Clipflow (DIY):** free, local-first PWA. No server, no keys, no auto-post.
- **Clipflow Managed:** MSTUDIO runs the DIY engine for you — batch renders, posts natively, reports monthly, kills losers fast.

## 2. Client onboarding: niche profile file per client

One JSON file per client. No DB, no dashboard v1.

```ts
// ClientProfile = Profile + packId
interface ClientProfile extends Profile {
  packId: string;
}
// Profile: { niche, audience, offer, tone, proof } — see src/lib/profile.ts
// packId: NichePack id — see src/lib/packs.ts, src/packs/*.json
```

Steps:

1. Copy `src/packs/mstudio.json` pattern or pick existing `packId` (default: `mstudio`).
2. Fill `niche / audience / offer / tone / proof` with the client (one line each, no empty strings).
3. Save as `clients/<client-slug>.json`, e.g. `clients/acme.json`.
4. Validate with `isProfile` (`src/lib/profile.ts`): all five Profile fields must be non-empty strings, plus `packId` must resolve via `loadPack(packId)` or onboarding fails.
5. First batch does not start until validation passes.

Example `clients/acme.json`:

```json
{
  "niche": "plumbers in Lisbon",
  "audience": "homeowners with urgent leaks",
  "offer": "fixed-price callout in 24h",
  "tone": "direct, confident, zero fluff",
  "proof": "200+ callouts, 4.9 rating",
  "packId": "mstudio"
}
```

## 3. Batch render session (weekly, free DIY engine)

Run on the operator laptop. Same loop as DIY (`README.md` DIY loop). No servers, no keys.

1. Load client file: `clients/<slug>.json` → Profile + `loadPack(packId)`.
2. Pick 3–5 ideas for the week (one hook each, pack `hooks` + `ctas` as defaults).
3. Per idea, in the DIY PWA: idea → deterministic script (hook + 3 beats + CTA) → render 720p vertical locally (Canvas + WebCodecs, word-level captions) → export `<slug>-916.mp4` + `<slug>-tiktok.txt` + `<slug>-x.txt` + `<slug>-linkedin.txt` to `exports/`.
4. QC: plays 9:16, captions readable, CTA + hashtags correct, no console errors. Re-render or file the first blocking bug.
5. Hand off: send `.mp4` + `.txt` pack to client (or post natively for them — manual post only, see §7 out of scope).
6. Log the batch in §4 calendar the same day.

Target: one 60–90 min session / client / week → 3–5 shippable videos.

## 4. Posting calendar (template)

Copy this table per week. `status` ∈ `draft | ready | posted | dead`.

| date | client | idea | platform | status |
|---|---|---|---|---|
| 2026-09-15 | acme | fixed-price callout in 24h | tiktok | posted |
| 2026-09-16 | acme | before/after leak fix | ig-reels | ready |
| 2026-09-17 | acme | 3 signs you need a plumber now | x | draft |
| 2026-09-18 | acme | why hourly billing rips you off | linkedin | draft |

Rules: one row per video per platform. Post natively (no auto-post v1). Log views/replies at day 7.

## 5. Monthly report (template)

Send one per client, first week of the month. Paste, fill, send.

```md
## Clipflow Managed — <client> — <YYYY-MM>

- Videos shipped: <n>
- Median views (day-7): <n>
- Top video: <idea> — <views> views — why it won: <one line>
- Worst video: <idea> — <views> views — why it lost: <one line>
- Next action: <keep | pivot niche | kill — per §6 kill rules>
```

Inputs: videos shipped from §4 calendar (`status=posted`), views at day 7 per video, median over the set.

## 6. Kill rules

Measured at day 7 per video, always.

- **Pivot:** median < 1000 views over last 10 videos at day 7 → pivot niche (new `ClientProfile` niche/audience/offer, same client file versioned).
- **Kill:** 2 failed pivots → kill. Stop production, send final §5 report with `Next action: kill`, archive `clients/<slug>.json`.

No exceptions, no sunk-cost extensions. The loop only scales winners.

## 7. Pricing + CTA

- **Retainer:** €500 setup + €300/mo.
- **Rev-share (alt):** €500 setup + 20% rev-share, 90-day minimum.

Setup covers onboarding (§2) + first batch (§3). Monthly covers weekly batch + posting log + monthly report. Rev-share needs attribution agreed in writing before batch one.

CTA: [Start Clipflow Managed](mailto:hello@mstudioweb.pt?subject=Clipflow%20Managed)

## 8. Out of scope (explicitly)

- No servers / no keys — local-first DIY engine only.
- No auto-post — export `.mp4` + `.txt`, post natively/manually.
- No OAuth / no scheduler — no TikTok/X/LinkedIn/IG integrations v1.
- Cloudflare cron explicitly out — no scheduled workers, no background jobs.

If a client asks for any of the above: decline, point at DIY.
