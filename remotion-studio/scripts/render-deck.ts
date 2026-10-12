/**
 * Export the sample keynote deck as an MP4 (same frames as the live player).
 *
 * Usage (from remotion-studio/):
 *   npx tsx scripts/render-deck.ts [--out=exports/clipflow-launch-deck.mp4]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { REMOTION_SERVE_PORT } from "../src/lib/remotion-serve";
import { clipflowLaunchDeck } from "../src/remotion/deck/clipflow-launch";
import { DECK_THEME } from "../src/remotion/deck/DeckComposition";

async function main(): Promise<void> {
  const root = process.cwd();
  const arg = (name: string, fallback: string): string => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  const out = path.resolve(arg("out", path.join(root, "exports", "clipflow-launch-deck.mp4")));
  const holdFrames = Number.parseInt(arg("holdFrames", "150"), 10) || 150;

  const deck = { ...clipflowLaunchDeck(), holdFrames };
  const inputProps = { deck, theme: DECK_THEME };
  console.log(`[deck] bundling (${deck.slides.length} slides)…`);
  const serveUrl = await bundle({
    entryPoint: path.join(root, "src", "remotion", "entry.tsx"),
    outDir: path.join(root, "data", "bundles", "deck"),
    publicDir: path.join(root, "public"),
    enableCaching: true,
  });
  console.log("[deck] selecting ClipDeck…");
  const composition = await selectComposition({ serveUrl, port: REMOTION_SERVE_PORT, id: "ClipDeck", inputProps });
  await mkdir(path.dirname(out), { recursive: true });
  console.log(`[deck] rendering ${composition.durationInFrames} frames -> ${out}…`);
  await renderMedia({
    composition,
    serveUrl,
    port: REMOTION_SERVE_PORT,
    inputProps,
    codec: "h264",
    enforceAudioTrack: false,
    pixelFormat: "yuv420p",
    crf: 19,
    concurrency: 2,
    outputLocation: out,
    overwrite: true,
    onProgress: ({ progress }) => console.log(`[deck] ${(progress * 100).toFixed(0)}%`),
  });
  console.log(`[deck] wrote ${out}`);
}

main().catch((error) => {
  console.error(`[deck] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
