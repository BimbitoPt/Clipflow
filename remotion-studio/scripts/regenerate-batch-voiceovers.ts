import { getBatch, updateClip } from "../src/lib/batch-store";
import { generateVoiceover } from "../src/lib/voiceover";

const batchId = process.argv[2];
if (!batchId) throw new Error("Pass a batch ID");

async function main() {
  const result = await getBatch(batchId);
  if (!result) throw new Error(`Batch ${batchId} was not found`);
  for (const clip of result.clips) {
    const generated = await generateVoiceover(clip.voiceover.script, clip.id);
    const durationSeconds = Math.max(clip.durationSeconds, Math.ceil(generated.durationSeconds + 0.5));
    await updateClip(batchId, clip.id, {
      ...clip,
      durationSeconds,
      voiceover: { ...clip.voiceover, ...generated },
      status: "needs_review",
      progress: 0,
      outputPath: null,
      coverPath: null,
      renderError: null,
      updatedAt: new Date().toISOString(),
    });
    console.log(`${clip.id}: ${generated.durationSeconds.toFixed(2)}s narration / ${durationSeconds}s clip`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
