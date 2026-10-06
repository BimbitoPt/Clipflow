/**
 * Stage the local Kokoro voice stack for the DIY/desktop studio:
 *   1. Pinned model weights -> public/models (downloaded once if missing)
 *   2. Voice bins           -> public/models/voices (from the kokoro-js package)
 *   3. ORT wasm runtime     -> public/ort (what transformers.js fetches)
 * After this, first synthesis never touches huggingface.co — a rate-limited
 * runtime fetch (SpeechT5's speaker_embeddings on a mutable `main` ref) is
 * exactly what broke voice export before.
 *
 * Usage: npm run model:install
 */
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Pinned revision — same one remotion-studio ships. Never track `main`.
const REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** Exact bytes at the pinned revision — guards against truncated downloads. */
const MODEL_FILES = [
  { name: "config.json", size: 44 },
  { name: "tokenizer.json", size: 3497 },
  { name: "tokenizer_config.json", size: 113 },
  { name: "onnx/model_quantized.onnx", size: 92_361_116 },
];
/** Voice bins the studio can synthesize with (Clipflow default first). */
const VOICES = ["af_heart"];
/** WebAssembly files the bundled transformers.js runtime fetches at synth time. */
const ORT_FILES = ["ort-wasm-simd-threaded.jsep.wasm", "ort-wasm-simd-threaded.jsep.mjs"];

const require = createRequire(import.meta.url);
const modelRoot = path.resolve("public", "models", ...MODEL_ID.split("/"));
const voiceDir = path.resolve("public", "models", "voices");
const ortDir = path.resolve("public", "ort");

async function ensureModelFile(file) {
  const target = path.join(modelRoot, ...file.name.split("/"));
  if ((await stat(target).catch(() => null))?.size === file.size) {
    console.log(`Ready: ${file.name}`);
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.download`;
  const url = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/${file.name}`;
  console.log(`Downloading ${file.name} (pinned ${REVISION.slice(0, 12)})...`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}): ${file.name}`);
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    const size = (await stat(temporary)).size;
    if (size !== file.size) throw new Error(`Unexpected size for ${file.name}: ${size} bytes (wanted ${file.size})`);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function stageVoices() {
  // Exports maps hide package.json — resolve the main entry instead.
  const voicesRoot = path.dirname(path.dirname(require.resolve("kokoro-js")));
  await mkdir(voiceDir, { recursive: true });
  for (const voice of VOICES) {
    const source = path.join(voicesRoot, "voices", `${voice}.bin`);
    const target = path.join(voiceDir, `${voice}.bin`);
    const expected = (await stat(source)).size;
    if ((await stat(target).catch(() => null))?.size === expected) {
      console.log(`Ready: voice ${voice}`);
      continue;
    }
    await copyFile(source, target);
    console.log(`Staged voice ${voice} (${expected} bytes)`);
  }
}

async function stageOrt() {
  // Same dist tree webpack references at runtime — byte-exact match.
  const dist = path.dirname(require.resolve("@huggingface/transformers"));
  await mkdir(ortDir, { recursive: true });
  for (const name of ORT_FILES) {
    const source = path.join(dist, name);
    const expected = (await stat(source)).size;
    const target = path.join(ortDir, name);
    if ((await stat(target).catch(() => null))?.size === expected) {
      console.log(`Ready: ort/${name}`);
      continue;
    }
    await copyFile(source, target);
    console.log(`Staged ort/${name} (${expected} bytes)`);
  }
}

async function main() {
  for (const file of MODEL_FILES) await ensureModelFile(file);
  await stageVoices();
  await stageOrt();
  console.log("Kokoro voice stack ready: public/models + public/ort");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
