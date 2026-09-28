# CLIPFLOW Remotion Studio

A local-first content production studio for planning, reviewing and rendering vertical marketing videos for multiple brands. The interface and renderer are designed for local use at `http://127.0.0.1:3020`.

## Development

Use Node.js 20 or newer. From this directory:

```sh
npm install
npm run model:install
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

Each clip can use a local [Kokoro 82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) voiceover. `npm run model:install` downloads the pinned, Apache-licensed q8 model into the repository's ignored `public/models` directory. Generation then runs offline; no paid TTS API is needed. Use **Generate missing VO** to queue narration for every clip without a track, watch batch progress, then edit a script, select a voice, regenerate one clip, and listen in its review panel. Clipflow defaults to Heart and MStudio to Bella; Michael is also selectable. Generated clips return to review before rendering. The local worker processes narration separately from the web app and resumes interrupted batches. Word highlighting is estimated from word length and punctuation across the generated narration, so check the preview for unusual pacing. Four motion styles are available per clip: kinetic type, soft float, punchy snap and cinematic drift. Editing the script or voice clears the previous voice track and rendered artifacts so the next render cannot silently reuse stale audio.

The Rust renderer in [`../native/README.md`](../native/README.md) has a separate SpeechT5 or Windows system-voice path; this studio uses Kokoro.

## Brand and media rules

The Remotion starter kits use lime green (`#CFFF47`) on near-black (`#080A0D`) for Clipflow, and electric blue (`#246BFD`) for MStudio Web. The saved kits in `data/brands` take precedence over these source defaults, so update an existing workspace kit in the Brand kits screen when changing a color. Re-render existing clips after a kit change so their MP4s and covers match the live preview. Add Sabre's real logo, colors, claims and voice through its kit before producing a Sabre clip. Use only owned or explicitly approved footage, music and proof; record provenance in the kit. Do not add customer results, testimonials or product claims without operator-supplied evidence.

Remotion's license eligibility depends on company size and the intended automated rendering workflow. Confirm that eligibility before using the studio for production batches.
