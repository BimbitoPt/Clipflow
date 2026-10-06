import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
if (process.platform !== 'win32') throw new Error('This packaging command targets Windows.');
await mkdir('src-tauri/resources', { recursive: true });
await copyFile(ffmpeg, 'src-tauri/resources/ffmpeg.exe');
const staging = '.desktop-public';
await mkdir(`${staging}/desktop-runtime`, { recursive: true });
for (const name of ['ort-wasm-simd.wasm', 'ort-wasm.wasm']) {
  await copyFile(`node_modules/@xenova/transformers/dist/${name}`, `${staging}/desktop-runtime/${name}`);
}
const sources = await Promise.all(['src/lib/broll.ts', 'src/lib/ai-backgrounds.ts'].map(path => readFile(path, 'utf8')));
const files = new Set(['/brand/mark.png', ...sources.flatMap(source => [...source.matchAll(/src:\s*"(\/[^\"]+)"/g)].map(match => match[1]))]);
for (const path of files) {
  const destination = join(staging, path.slice(1));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(`public${path}`, destination);
}
console.log('Bundled Windows FFmpeg is ready.');
