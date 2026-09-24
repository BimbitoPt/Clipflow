import { runRenderWorker } from "./src/lib/render-worker";

runRenderWorker().catch((error) => {
  console.error(`[remotion] worker stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
