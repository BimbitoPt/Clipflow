import { getBatch, updateClip } from "../src/lib/batch-store";
import { approveClip } from "../src/lib/clip-state";
import { enqueueApproved } from "../src/lib/render-queue";

const batchId = "batch-3329024d-d228-4a1a-b2dc-5b3110fca943";
const concepts = new Set([
  "Clipflow first TikTok: one idea, four beats",
  "AI shortlist, website trust test: 44.7% still check",
]);

async function main() {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Production batch is missing");
  const targets = batch.clips.filter((clip) => concepts.has(clip.concept));
  if (targets.length !== concepts.size) throw new Error("Prepare both new social videos before rendering");
  const pending = targets.filter((clip) => clip.status !== "rendered" || !clip.outputPath);
  if (!pending.length) {
    console.log("Both social videos are already rendered.");
    return;
  }
  for (const clip of pending) {
    if (clip.status !== "needs_review" && clip.status !== "failed" && clip.status !== "approved") {
      throw new Error(`${clip.concept} cannot be rendered from status ${clip.status}`);
    }
    if (clip.status !== "approved") await updateClip(batchId, clip.id, approveClip(clip));
  }
  const queued = await enqueueApproved(batchId);
  console.log(queued.map((job) => `${job.clipId}: ${job.id}`).join("\n"));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
