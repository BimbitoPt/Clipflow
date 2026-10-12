/**
 * Live check: timed Kokoro synthesis through generateVoiceover.
 *
 * Run from remotion-studio with the staged timestamped model:
 *   npx tsx scripts/verify-word-timings.ts
 *
 * Prints model-predicted word spans next to the old char-weighted estimates
 * and asserts the caption-alignment contract (count, order, contiguity,
 * coverage of the audio length).
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { estimateWordTimings, generateVoiceover } from "../src/lib/voiceover";

const script = "Make every word easy to follow. Real timestamps, straight from the model, no guessing.";

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "clipflow-timed-voice-"));
  try {
    const result = await generateVoiceover(script, "timed-check", root, undefined, { voiceId: "af_heart" });
    const predicted = result.wordTimings;
    const estimated = estimateWordTimings(script, result.durationSeconds);
    const words = script.split(/\s+/);

    console.log(`audio: ${result.durationSeconds.toFixed(2)}s  words: ${predicted.length}  digest: ${result.generatedFor}`);
    console.log("word".padEnd(12), "predicted".padEnd(18), "estimated");
    words.forEach((word, index) => {
      const p = predicted[index]!;
      const e = estimated[index]!;
      console.log(
        word.padEnd(12),
        `${p.start.toFixed(3)}-${p.end.toFixed(3)}`.padEnd(18),
        `${e.start.toFixed(3)}-${e.end.toFixed(3)}`,
      );
    });

    const errors: string[] = [];
    if (predicted.length !== words.length) errors.push(`count ${predicted.length} != ${words.length}`);
    predicted.forEach((span, index) => {
      if (span.word !== words[index]) errors.push(`order broken at ${index}: ${span.word}`);
      if (index && span.start < predicted[index - 1]!.end - 1e-6) errors.push(`overlap at ${index}`);
    });
    const last = predicted.at(-1);
    if (last && Math.abs(last.end - result.durationSeconds) > 1e-6) {
      errors.push(`last end ${last.end} != audio ${result.durationSeconds}`);
    }
    if (errors.length) {
      console.error("CONTRACT VIOLATIONS:", errors);
      process.exitCode = 1;
    } else {
      console.log("\ncontract OK: contiguous spans covering the full narration, one per script token");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
