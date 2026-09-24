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

## Brand and media rules

Clipflow and MStudio starter kits use the brand material in the repository. Add Sabre's real logo, colors, claims and voice through its kit before producing a Sabre clip. Use only owned or explicitly approved footage, music and proof; record provenance in the kit. Do not add customer results, testimonials or product claims without operator-supplied evidence.

Remotion's license eligibility depends on company size and the intended automated rendering workflow. Confirm that eligibility before using the studio for production batches.
