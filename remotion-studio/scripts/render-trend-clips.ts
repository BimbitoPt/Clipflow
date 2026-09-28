import { getBatch, updateClip } from "../src/lib/batch-store";
import { approveClip } from "../src/lib/clip-state";
import { enqueueApproved } from "../src/lib/render-queue";

const batchId = "batch-3329024d-d228-4a1a-b2dc-5b3110fca943";
const concepts = new Set(["Shorts Series: make episode one", "AI Search: the website basics"]);

async function main() {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Marketing batch is missing");
  const targets = batch.clips.filter((clip) => concepts.has(clip.concept));
  if (targets.length !== concepts.size) throw new Error("Prepare both trend clips before rendering");
  for (const clip of targets) {
    if (clip.status === "rendered") continue;
    if (clip.status !== "needs_review" && clip.status !== "failed") throw new Error(`${clip.id} is ${clip.status}`);
    await updateClip(batchId, clip.id, approveClip(clip));
  }
  const queued = await enqueueApproved(batchId);
  console.log(queued.map((job) => `${job.clipId}: ${job.id}`).join("\n"));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
