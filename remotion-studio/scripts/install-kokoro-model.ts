import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const revision = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
const root = path.resolve(process.cwd(), "..", "public", "models", ...modelId.split("/"));
const files = [
  { name: "config.json", size: 44 },
  { name: "tokenizer.json", size: 3497 },
  { name: "tokenizer_config.json", size: 113 },
  { name: "onnx/model_quantized.onnx", size: 92361116 },
];

async function main() {
  for (const file of files) {
    const target = path.join(root, ...file.name.split("/"));
    if ((await stat(target).catch(() => null))?.size === file.size) {
      console.log(`Ready: ${file.name}`);
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.download`;
    const url = `https://huggingface.co/${modelId}/resolve/${revision}/${file.name}`;
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

main().catch((error) => { console.error(error); process.exitCode = 1; });
