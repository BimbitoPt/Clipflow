import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

// renders `<outdir>/cover.jpg` from a video:
//   1. frame grab at COVER_SECS (default 6s, the hook midpoint)
//   2. fill thumbs/cover-template.html ({{HOOK_HTML}}, {{SUB_TOP}},
//      {{CHIP_TOP}}, {{SHOT}})
//   3. Playwright screenshot at 2x
// usage: node scripts/render-cover.mjs <video.mp4> <outdir> [hookText]

const [, , video, outdir, hookArg] = process.argv;
if (!video || !outdir) {
  console.error('usage: node scripts/render-cover.mjs <video.mp4> <outdir> [hookText]');
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, '..');
mkdirSync(outdir, { recursive: true });

// Frame source: caption-free clean asset when COVER_ASSET is provided,
// falling back to the video itself (captions burned in, still usable).
const shotVideo = process.env.COVER_ASSET || video;
const ff = ffmpegPath;
const grab = path.join(path.resolve(outdir), 'cover-base.jpg');
mkdirSync(path.dirname(grab), { recursive: true });
mkdirSync(outdir, { recursive: true });

const secs = process.env.COVER_SECS || '1.5';
const grabRes = spawnSync(ff, [
  '-y', '-ss', secs, '-i', shotVideo,
  '-frames:v', '1', '-update', '1', '-q:v', '2', grab,
], { encoding: 'utf8' });
if (grabRes.status !== 0 || !existsSync(grab)) {
  console.error('frame grab failed:', (grabRes.stderr || '').slice(-400));
  process.exit(2);
}

const rawHook = hookArg
  ? hookArg
  : 'A website that <span class="blue">ships in 2&nbsp;weeks</span> beats one that never does';
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const trimmed = rawHook.length > 90 ? rawHook.slice(0, rawHook.lastIndexOf(' ')) : rawHook;
const hookHtml = hookArg ? escape(trimmed) : rawHook;
const chipTop = process.env.COVER_CHIP || '45S';
const subTop = process.env.COVER_SUB || 'Here are three we built.';

const shotUrl = pathToFileURL(path.resolve(grab)).href;
let html = readFileSync(path.join(root, 'thumbs', 'cover-template.html'), 'utf8');
html = html
  .replaceAll('{{HOOK_HTML}}', hookHtml)
  .replaceAll('{{SUB_TOP}}', escape(subTop))
  .replaceAll('{{CHIP_TOP}}', escape(chipTop))
  .replaceAll('{{SHOT}}', shotUrl);

const filledPath = path.join(path.resolve(outdir), 'cover-filled.html');
writeFileSync(filledPath, html);

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH,
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.resolve(filledPath)).href);
await page.waitForTimeout(400);
const out = path.join(outdir, 'cover.jpg');
await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
await browser.close();
unlinkSync(filledPath);
console.log(out);
