import { mkdir, copyFile, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import ffmpeg from 'ffmpeg-static';
if (process.platform !== 'win32') throw new Error('This packaging command targets Windows.');
await mkdir('src-tauri/resources', { recursive: true });
await copyFile(ffmpeg, 'src-tauri/resources/ffmpeg.exe');
const staging = '.desktop-public';

// Stage directories into the desktop public dir, size-checked so re-runs
// skip the large files instead of copying them every time. Used for the
// Kokoro model weights (public/models, ~150MB) and the ORT wasm runtime
// (public/ort) that tts-local.ts loads from /models and /ort.
async function stageDir(source, target) {
  const entries = await readdir(source, { withFileTypes: true, recursive: true }).catch(() => null);
  if (!entries) return 0;
  let staged = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const from = join(entry.parentPath ?? entry.path, entry.name);
    const to = join(target, relative(source, from));
    const fromSize = (await stat(from)).size;
    if ((await stat(to).catch(() => null))?.size === fromSize) continue;
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    staged++;
  }
  return staged;
}

const modelFiles = await stageDir('public/models', `${staging}/models`);
const ortFiles = await stageDir('public/ort', `${staging}/ort`);
console.log(`Staged ${modelFiles} model file(s), ${ortFiles} ort file(s).`);

const sources = await Promise.all(['src/lib/broll.ts', 'src/lib/ai-backgrounds.ts'].map(path => readFile(path, 'utf8')));
const files = new Set(['/brand/mark.png', ...sources.flatMap(source => [...source.matchAll(/src:\s*"(\/[^\"]+)"/g)].map(match => match[1]))]);
for (const path of files) {
  const destination = join(staging, path.slice(1));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(`public${path}`, destination);
}
console.log('Bundled Windows FFmpeg is ready.');
