# CLIPFLOW Remotion Studio

A local-first content production studio for planning, reviewing and rendering vertical marketing videos for multiple brands. The interface and renderer are designed for local use at `http://127.0.0.1:3020`.

## Development

Use Node.js 20 or newer. From this directory:

```sh
npm install
npm run dev
```

The development command starts the web app and local render worker together. Persistent app data and render outputs live below this directory and are ignored by Git. Stop and restart the command to recover saved work.

```sh
npm test
npm run build
```

## Batch workflow

Create a batch with 10–20 mixed-brand clip briefs, then edit and preview each clip before approving it. Render approved clips from the batch page. The local worker processes one clip at a time; if it stops, restart `npm run dev` and queued work resumes. The export button downloads a ZIP containing MP4s, matching cover images, post-copy text and a manifest. Partial exports include successful clips and list failed or incomplete clips in the manifest without including their media.

Before export, check the opening hook, spelling, brand, caption safe area, proof and CTA in the preview. Attach only operator-approved music in the brand kit; it is mixed at a restrained level across the full clip. Watch the rendered clip and confirm its cover and post copy before manual posting. The studio does not publish or schedule posts.

Each clip can also use a local SpeechT5 voiceover. Use **Generate missing VO** to queue narration for every clip without a track, watch batch progress, then edit a script, regenerate one clip, and listen in its review panel; generated clips remain in review. The local worker processes narration separately from the web app and resumes interrupted batches. The model weights and speaker embedding must exist in the repository's `public/models` directory; follow the prerequisites in [`../native/README.md`](../native/README.md) to install them. SpeechT5 is the same English voice for every clip; it currently does not provide selectable voices or multilingual output. Word highlighting is estimated from word length and punctuation across the generated narration, so check the preview for unusual pacing. Four motion styles are available per clip: kinetic type, soft float, punchy snap and cinematic drift. Editing the script clears the previous voice track and rendered artifacts so the next render cannot silently reuse stale audio.

## Brand and media rules

Clipflow and MStudio starter kits use the brand material in the repository. Add Sabre's real logo, colors, claims and voice through its kit before producing a Sabre clip. Use only owned or explicitly approved footage, music and proof; record provenance in the kit. Do not add customer results, testimonials or product claims without operator-supplied evidence.

Remotion's license eligibility depends on company size and the intended automated rendering workflow. Confirm that eligibility before using the studio for production batches.
