import { getBatch, updateClip } from "../src/lib/batch-store";
import { approveClip } from "../src/lib/clip-state";
import { enqueueApproved } from "../src/lib/render-queue";

const batchId = "batch-3329024d-d228-4a1a-b2dc-5b3110fca943";
const targets = new Set(["clip-d04f2a22-efd7-4db3-9d04-e930766b5568", "clip-1a53c2dc-9598-4d52-a577-d7fad03fe444"]);
async function main() {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Featured batch missing");
  for (const clip of batch.clips.filter((item) => targets.has(item.id) && item.status !== "rendered" && item.status !== "rendering")) await updateClip(batchId, clip.id, approveClip(clip));
  const queued = await enqueueApproved(batchId);
  console.log(queued.map((job) => `${job.clipId}: ${job.id}`).join("\n"));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
