import { getBatch, updateClip } from "../src/lib/batch-store";
import { approveClip } from "../src/lib/clip-state";
import { enqueueApproved } from "../src/lib/render-queue";

const batchId = "batch-3329024d-d228-4a1a-b2dc-5b3110fca943";
const clipId = "clip-0b19a545-288f-4ffe-a941-9a7f57359ea3";

async function main() {
  const batch = await getBatch(batchId);
  const clip = batch?.clips.find((item) => item.id === clipId);
  if (!clip) throw new Error("Prepared MStudio DevDay video is missing");
  if (clip.status !== "approved") await updateClip(batchId, clipId, approveClip(clip));
  const jobs = await enqueueApproved(batchId);
  const job = jobs.find((item) => item.clipId === clipId);
  if (!job) throw new Error("MStudio DevDay video was not queued");
  console.log(`Queued render job ${job.id} for ${clipId}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
