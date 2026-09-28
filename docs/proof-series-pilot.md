# Proof on screen: ten short episodes

This pilot has five Clipflow episodes and five MStudio Web episodes. Episode 01 in each brand is the cinematic hero; the other four are repeatable series entries. Every episode is self-contained and exports one 9:16 MP4 for YouTube Shorts or TikTok, plus a cover and platform post text. The pilot does not publish posts.

| Brand | Ep. | Hook | Proof shown |
| --- | ---: | --- | --- |
| Clipflow | 01 | The blank page ends here | Idea, generated script, vertical preview |
| Clipflow | 02 | A short needs a spine | Idea and script structure |
| Clipflow | 03 | See the frame first | Script beside vertical preview |
| Clipflow | 04 | The last step is a file | Preview and export control |
| Clipflow | 05 | Make once. Post twice | Vertical preview, MP4 export and caption copy |
| MStudio Web | 01 | What if the price was already on the page? | Live home and pricing pages |
| MStudio Web | 02 | Your website can start at €299 | Live Speed Site and ownership sections |
| MStudio Web | 03 | One repetitive workflow, rebuilt | Live services and AI Automation Build pages |
| MStudio Web | 04 | A handoff should actually hand off | Live ownership section |
| MStudio Web | 05 | You don't need a polished deck | Live contact form and pricing process |

Proof was captured on 2026-09-28 from the local Clipflow app at `http://localhost:8081/` and MStudio Web's [home](https://www.mstudioweb.pt/), [pricing](https://www.mstudioweb.pt/pricing), [services](https://www.mstudioweb.pt/services), and [contact](https://www.mstudioweb.pt/contact) pages. The local Clipflow example uses a MStudio website idea to demonstrate the real idea-to-script workflow. No client work is shown.

The live pricing page currently lists Speed Site at €299, AI Automation Build at €449, and a €699 Premium Bundle. Earlier creative notes called the €699 item “Brand + Website System”; these clips avoid that discrepancy by focusing on the first two offers. Recheck the live site before publishing price-led posts.

Reusable source screenshots live in `remotion-studio/public/proof-screens/`. `scripts/capture-proof-screens.mjs` captures the site, while `scripts/capture-clipflow-workflow.mjs` captures the local app workflow. The episode manifests, voiceover preparation and render queue are in `remotion-studio/scripts/produce-proof-series.ts`. Run it in the Remotion Studio folder to prepare; run it with `--render` after checking the briefs to queue them. `remotion-studio/scripts/package-proof-series.ts` writes the ready-to-post folder after all ten have rendered.
