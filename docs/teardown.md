# Clipflow teardown — OpusClip, Captions, Descript, VEED, Framedrop

Date: 2026-09-12. Sources: official sites/pricing/docs + App Store/Play + G2/Capterra. No signups, no paywall bypass. Prices USD, official page wins on conflicts.

## 1. Per-app snapshot

### OpusClip (opus.pro) — long-to-short clipper
- Loop: link/upload → AI curation (ClipAnything + Virality Score) → auto-reframe + captions + brand template → edit → export/schedule.
- Captions: auto, word-level animated + emoji + keyword highlight, 20+ langs, claimed 97%+.
- Export: Free 9:16 only, 1080p, watermarked, MP4 only, projects expire after 3 days. Pro adds 1:1/16:9, 4K, bulk, Premiere XML.
- Pricing: Free $0 (60 credits/mo ≈ 60 min) → Starter $15 → Pro $29/mo ($14.50 annual) → Business custom. 7-day Pro trial.
- Paywall trigger: Edit click, watermark removal, >3 days old, >60 min, multi-ratio/scheduler/B-roll/custom font.
- Tech (blog only): ClipAnything multimodal, ReframeAnything tracking, Virality Score, Agent Opus B-roll. No foundation vendors disclosed. SOC 2 II.
- Verdict: steal 1-click loop + virality ranking + brand defaults; avoid credit meter + 3-day expiry + watermark hostility.

### Captions (captions.ai) — AI editor
- Loop: import/record/prompt → auto-transcribe + auto-edit → style pick (100+ caption styles, 30+ presets, avatars/AI Twin) → chat Co-Editor → export.
- Captions: word-level open captions default, 100+ transcription langs, 100+ translation, dubbing 29 langs, SRT sidecar.
- Export: 9:16/16:9/1:1/4:5, up to 4K, no watermark on Free for basic tools; paid features force upgrade/watermark.
- Pricing: Free $0 (60–200 lifetime credits, 1 template) → Basic $9.99 → Max $25–30 → Scale $70+. Credit-per-generation.
- Paywall trigger: Generate/Export with paid feature, or credit exhaustion (re-edits re-bill).
- Tech (blog only): Mirage Avatar X + API; third-party models disclosed: Veo 3, Kling, Pika, ElevenLabs, Flux/Imagen/DALL-E.
- Verdict: steal one-tap presets + instant open-caption default + export-time paywall; avoid credit-per-regeneration + tier-locked styles ("misleading trial" reviews).

### Descript — text-based editor
- Loop: record/import → transcript = timeline (edit text, media follows) → Underlord AI polish + layouts + captions → export/publish.
- Captions: auto, synced on edit, Classic/Clean/Karaoke + custom, word-level karaoke, SRT/VTT or burned-in, 25 transcription / 61 translation / 30 dubbing langs.
- Export: Free 720p watermarked; Hobbyist $24/$16 1080p clean; Creator $35/$24 4K; batch/timeline export Creator+.
- Pricing: Free (60 min/mo + 100 one-time AI credits) → Hobbyist → Creator → Business $65/$50. Dual meter: media hours + AI credits.
- Paywall trigger: 61st minute, credit exhaustion, >720p, watermark-off, custom layouts.
- Tech (blog only): Underlord agentic on Claude (Sonnet 4.5 default, Opus 4.6 enterprise; also GPT/Gemini), Rev AI transcription option.
- Verdict: steal script-as-source-of-truth + scene layouts + karaoke captions; avoid dual-meter paywalls + watermarked 720p free.

### VEED — browser editor
- Wedge: auto-subtitles + templates + AI voice/avatars/dubbing. Logos: Amazon, Google, Netflix, Meta, BBC.
- Export: Free watermarked 720p ~10-min cap → Creator $25/mo ($12.25 annual) 1080p clean → Pro $49/mo ($24) 4K → Studio $79/seat → Enterprise custom. AI via annual credit pool.
- Reviews: G2 4.6/5 (~2K, ease + subtitling praised, credit burn hated); Capterra 3.2/5 (billing disputes); App Store 4.8/5 (mobile skews positive).
- Verdict: steal frictionless browser editing + subtitle engine; avoid credit metering + unusable free tier. Gap: transparent flat pricing + watermark-free entry.

### Framedrop — AI clipper (streamers/gaming)
- Loop: YouTube/Twitch/upload → highlight detection + labeling → trim/compilations → QR export to TikTok/IG/YT/X. Chrome extension + web.
- Free ~60 min talking / 240 gaming per month; Starter ~$8–12.50, Pro ~$18.50–24.17 (no watermark, priority). Cloud processing, NOT local-first.
- Name collision risk: `framedrop.work` (ffmpeg.wasm/Canvas, no upload, no watermark) and `framedrop.video` are different free tools.
- Verdict: steal 1-click repurpose + gaming positioning + low entry price; the `framedrop.work` pattern (client-side, spec-targeted, no upload) is the local-first model to copy.

## 2. Cross-cutting patterns → Clipflow actions

| Pattern (all 5) | Clipflow module | Action |
|---|---|---|
| Word-level animated open captions are the default everywhere | captions/render | KEEP: kinetic word-level default already planned; ADD caption style presets (≥3) before v2 — Captions has 100+, parity impossible, 3 good ones suffice |
| Credit meters + watermark paywalls drive the worst reviews | pricing/funnel | DIFFERENTIATE: unlimited drafts + clean 720p export free forever; charge (later) for convenience (1080p, batch, cloud voices), never hostage storage/expiry |
| Paywall fires at Export, not at creation | funnel | STEAL: let users build everything free; monetize export upgrades only (matches free-tool → Mstudio upsell) |
| Brand kits/templates auto-applied (OpusClip, Descript layouts) | packs/template | STEAL: niche packs ARE the brand kit — auto-apply theme + hooks, zero config |
| Script-as-source-of-truth (Descript) | script | KEEP: script engine already central; ADD karaoke word-timing when TTS lands (cues already timed) |
| Virality/quality scoring (OpusClip) | script | AVOID v1: scores need trend data = server; deterministic packs instead (already decided) |
| Onboarding ≤3 steps to first video everywhere | app shell | STEAL: idea box on first screen, MSTUDIO default profile = zero-step start (already have) |
| Mobile skews positive (VEED 4.8★ app) | app shell | NOTE: PWA must feel native on phones; test export on mobile Chrome early (WebCodecs Android = MediaCodec, fine) |
| Dual meters (minutes + credits) confuse buyers | pricing | AVOID: single simple rule if paid tier ever lands |

## 3. Free-trial testing — SKIPPED (owner decision 2026-09-12)

Trials dropped; teardown stands on public research (§1) → actions (§2) only.
Revisit only if a §2 action is ever blocked on first-hand data.
