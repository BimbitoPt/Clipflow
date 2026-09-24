# CLIPFLOW Remotion Studio — Product Design

**Status:** Approved design; awaiting review of this written spec before the implementation plan.

## Problem

Clipflow needs a reliable supply of finished marketing clips while its wider product work continues. The clips must promote several related brands, including Clipflow, MStudio Web, Sabre and additional brands added later. Producing each short separately makes it harder to publish consistently and keep the voice, graphics and pacing right for each brand.

## Goal

Build a local production studio that can prepare a mixed-brand batch of 10–20 polished, reviewable vertical marketing videos and export the approved clips, covers and post copy together.

The studio is an internal content-production tool first. One batch may contain clips for multiple brands. A batch can be rerendered later without losing its edits or approvals.

## User and success criteria

The primary user is the CLIPFLOW marketing operator preparing daily posts for several brands. A successful first release lets that user:

- create or import 10–20 clip briefs in one batch, each with a brand and a distinct message;
- reuse an editable brand kit for logos, colors, fonts, voice, default call to action and approved media;
- choose an animated explainer, product demonstration or proof/story format for each clip;
- preview and edit each clip before approving it;
- render only approved clips and export their MP4, cover image and platform-ready post copy in one batch folder;
- identify a render failure per clip and retry that clip without losing the other results.

The app does not publish to social networks. Posting and scheduling stay manual.

## Product workflow

1. Create a batch and add clip briefs through a form, pasted rows or CSV import. Each brief names a brand, a hook, the main message or proof, an optional supporting point, a call to action and a format. The user can also edit the generated scene copy in the clip review.
2. Choose or create brand kits. Clipflow and MStudio Web can start from the repository's existing brand and MStudio material. Other brands, including Sabre, are created from an editable setup form; no brand facts or assets are invented.
3. Generate a review grid. Every card shows the brand, format, script, preview, render state and approval state. The user can edit the text, switch format, change the media and regenerate one clip.
4. Review the batch and mark the clips ready. A batch render processes approved clips locally and reports progress and failures by clip.
5. Download a ZIP containing the approved MP4s, cover PNGs, post-copy text files and a batch manifest. Filenames include the brand and clip slug to avoid collisions.

## Video direction

All initial formats target 9:16 vertical publishing. The standard export is 1080 × 1920 pixels, 30 frames per second, H.264 video and AAC audio in an MP4 with fast-start metadata. The default duration is 25 seconds; each brief can target 10–60 seconds.

The first composition families are:

- **Animated explainer:** kinetic typography, short narrative beats, animated shapes and purposeful scene transitions.
- **Product demonstration:** locally supplied product or website footage, device framing, callouts and a clear payoff.
- **Proof/story:** a problem-to-outcome sequence using approved proof, testimonials or before/after material supplied in the brief or brand kit.

Motion should make each point easier to follow. Each family has a small, curated transition set; transitions, text entrances, scene durations and sound cues are deterministic at a given frame and clip brief. Keep captions readable on a phone and inside common platform safe areas. Brand colors, logo use, type and caption treatments come from that clip's brand kit. The three composition families share a reusable motion system while retaining distinct layouts and pacing.

## Application architecture

Create a standalone local web app in `remotion-studio/`, separate from the existing PWA, SaaS site and landing site. Use React for the interface and Remotion compositions. Embed the composition in the review grid with `@remotion/player`; preview and export must use the same composition and input props. Render files with the Node-side `@remotion/renderer` `renderMedia()` API and FFmpeg. Do not use a different browser-only encoder for final exports.

The app consists of four bounded areas:

- **Brand library:** validates and persists versioned brand-kit JSON and copies uploaded logos, fonts and media into the local library.
- **Batch and clip data:** stores the editable briefs, scene copy, composition family, overrides, approval and per-clip render status.
- **Motion compositions:** provides the three formats, shared transitions, typography, captions, logo and sound behavior as frame-deterministic React compositions.
- **Local render worker:** accepts approved clips, bundles the composition once for a batch, renders clips with bounded local concurrency, records progress and errors, and builds the ZIP when complete.

Use Next.js with its Node runtime for the local interface and filesystem-backed API. Bind the interface to `127.0.0.1`; reject mutation requests from other origins. Start the interface and a separate local worker from the app's documented development command so a browser request does not need to remain open during a batch render. Store editable state beneath `remotion-studio/data/`; store batch exports beneath `remotion-studio/exports/`. Both paths are local and excluded from Git. Validate upload type and size, generate destination names inside the media root, and reject paths that resolve outside it. The media supplied with the repository is source material; generated renders, uploaded client material, local databases and secrets are not committed.

## Data and state

- A **brand kit** has a stable ID, display name, palette, font references, logo/media paths, tone guidance, default CTA, caption treatment and a list of approved proof and visual assets.
- A **clip brief** has a stable ID, batch ID, brand ID, concept, hook, key message, optional proof/supporting point, CTA, composition family, duration, editable scene copy and media overrides.
- A **batch** has an ID, creation time, clip IDs and a state derived from its clips.
- Each clip tracks `draft`, `needs_review`, `approved`, `rendering`, `rendered` or `failed`, with render progress, output paths and a bounded error message. Approval is explicit; unapproved clips are not included in final exports.

Save each edit before starting a render. Render output uses a unique batch/brand/slug path so rerenders and same-title clips from different brands cannot overwrite one another. A failure is isolated to the affected clip. Restarting the app recovers saved batches and completed files from disk.

## Quality and acceptance criteria

- A mixed-brand batch accepts 10–20 briefs and preserves the selected brand and format on each clip.
- All three composition families render successfully from saved clip data with their brand kit applied.
- The exact composition shown in preview is the one sent to the renderer; seeking, playback and rendered frame output agree at sampled frame positions.
- Every completed MP4 meets the selected dimensions, frame rate, codec and container settings and plays in a current browser player.
- Captions fit within the vertical safe area, retain contrast against every supported background and render the same in preview and export.
- A user can edit and approve clips individually; a batch export includes approved successes and their matching cover/post-copy files, and never labels a failed or unapproved clip as ready.
- One failed render does not cancel completed clips or block retries.
- Brand data, approvals and completed outputs survive closing and reopening the local app.
- The normal app flow has no social publishing integration, no server-side user accounts and no mandatory third-party content or generation API.
- The interface and filesystem API accept connections from the local machine only.

## Testing and visual review

Use small composition tests for brand props, timing boundaries, caption layout, scene transitions and deterministic output. Use renderer integration checks for each format, representative still frames and a short MP4. Inspect frame samples and the assembled video at phone size for cut timing, text clipping, safe areas, transition quality, brand mismatch, missing media, audio pops and an unintentional final frame. Exercise one successful batch, one failed clip with a retry, one restart during queued work and one mixed-brand ZIP inspection. Add checks at the behavior boundary being introduced instead of duplicating component internals.

## Constraints and exclusions

- Keep v1 local-first and single-user. There is no cloud render service, team workspace or remote asset store.
- Do not auto-publish, schedule posts, generate unlimited variants, or add a timeline editor in v1.
- Do not fabricate metrics, testimonials, customer logos or Sabre brand rules. The operator supplies or approves those facts and assets.
- Use only owned or explicitly approved media. Store its source/license note in the brand kit when applicable.
- Keep every `remotion` and `@remotion/*` dependency on one exact version. Confirm package version compatibility and Remotion license eligibility for the organization's headcount and automated render flow before the first production batch.
- The operator's batch target is 10–20 clips. Render concurrency is bounded and may be set to one on slower machines; a batch reports completion time rather than promising a fixed render speed.

## Remotion references

- [Remotion Player](https://www.remotion.dev/docs/player) — embed the same React composition for interactive preview.
- [Remotion renderer](https://www.remotion.dev/docs/renderer) — server-side `renderMedia()` renders frames and encodes video.
- [Remotion transitions](https://www.remotion.dev/docs/transitions) — transition series, timings and presentations.
- [Remotion license FAQ](https://convert.remotion.dev/docs/license/faq) and [license/pricing](https://convert.remotion.dev/docs/license/pricing) — eligibility and render-based licensing vary by team size and use. A Player/editor and programmatic batch renderer may count as automation when the company license applies.
