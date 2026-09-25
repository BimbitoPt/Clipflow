import { runRenderWorker } from "./src/lib/render-worker";
import { runVoiceoverWorker } from "./src/lib/voiceover-worker";

Promise.all([runRenderWorker(), runVoiceoverWorker()]).catch((error) => {
  console.error(`[remotion] local worker stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
