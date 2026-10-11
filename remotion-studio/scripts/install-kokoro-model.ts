import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const revision = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
const files = [
  { name: "config.json", size: 44 },
  { name: "tokenizer.json", size: 3497 },
  { name: "tokenizer_config.json", size: 113 },
  { name: "onnx/model_quantized.onnx", size: 92361116 },
];
/** Timestamped twin: same checkpoint + per-token duration head (timed word spans). */
const tsRevision = "dd4401a9add81ac692d20e240d22ec9dda82cc29";
const tsModelId = "onnx-community/Kokoro-82M-v1.0-ONNX-timestamped";
const tsFiles = [
  { name: "config.json", size: 44 },
  { name: "tokenizer.json", size: 3497 },
  { name: "tokenizer_config.json", size: 113 },
  { name: "onnx/model_quantized.onnx", size: 92361055 },
];

async function main() {
  for (const [id, rev, list] of [[modelId, revision, files], [tsModelId, tsRevision, tsFiles]] as const) {
    const root = path.resolve(process.cwd(), "..", "public", "models", ...id.split("/"));
    for (const file of list) {
      const target = path.join(root, ...file.name.split("/"));
      if ((await stat(target).catch(() => null))?.size === file.size) {
        console.log(`Ready: ${file.name}`);
        continue;
      }
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.download`;
      const url = `https://huggingface.co/${id}/resolve/${rev}/${file.name}`;
      console.log(`Downloading ${file.name}...`);
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}): ${file.name}`);
      try {
        await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(temporary));
        const size = (await stat(temporary)).size;
        if (size !== file.size) throw new Error(`Unexpected size for ${file.name}: ${size} bytes`);
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    console.log(`Kokoro model ready in ${root}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
