#!/usr/bin/env node
// Shoot your own vertical website footage with headless Chromium.
// Native look: no CSS filters, no DOM transforms - the site renders exactly
// as designed. Two takes per site:
//   web-<slug>-hero.mp4   : camera zoom (ffmpeg zoompan) on a real 2x still
//   web-<slug>-scroll.mp4 : eased native scroll, same take energy
// Both: silent 720x1280 30fps H.264 into public/broll/clips/.
// CHROME_PATH overrides the pinned cached Chromium.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import ffmpegPath from "ffmpeg-static";

const SITES = [
  ["pontea", "https://pontea.pt"],
  ["mstudioweb", "https://mstudioweb.pt"],
  ["clipflowapp", "https://clipflowapp.vercel.app"],
];

const VIEW_W = 405; // recorded at 2x deviceScale => 810x1440 real pixels
const VIEW_H = 720;

const OUT_DIR = path.resolve("public", "broll", "clips");
mkdirSync(OUT_DIR, { recursive: true });

const { chromium } = await import("@playwright/test").catch(() => {
  console.error("install playwright: npm i -D @playwright/test --legacy-peer-deps");
  process.exit(1);
});

const ENCODE_ARGS = (ss) => [
  "-y",
  "-ss", String(ss), "-i",
  "-t", "7", "-an",
];

const CAMERA_FILTER =
  "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,eq=brightness=-0.04:saturation=1.05";

function encode(input, dest, ss) {
  execFileSync(ffmpegPath, [
    "-y", "-ss", String(ss), "-i", input,
    "-t", "7", "-an",
    "-vf", CAMERA_FILTER,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-movflags", "+faststart",
    dest,
  ]);
}

// Hero take: ffmpeg-driven camera zoom over the real still (no DOM changes).
// Push 1.00 -> 1.22 plus a slow leftward drift so the still reads as motion.
function heroFromStills(stillPath, dest) {
  const n = 210;
  execFileSync(ffmpegPath, [
    "-y",
    "-loop", "1", "-i", stillPath,
    "-frames:v", String(n),
    "-vf",
    "scale=1440:2560,zoompan=z='min(1+0.0010*on,1.22)':d=" + n + ":x='iw/2-(iw/zoom/2)-on*0.35':y='ih*0.15+(ih/zoom/2-ih*0.12)*on/" + n + "':s=720x1280:fps=30,setsar=1",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart",
    dest,
  ]);
}

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    String.raw`C:\Users\Guilh\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe`,
});

let takes = 0;
const ONLY = process.env.ONLY;
for (const [slug, url] of SITES) {
  if (ONLY && slug !== ONLY) continue;
  const work = path.join(tmpdir(), `clipflow-webshoot-${slug}-${Date.now()}`);
  mkdirSync(work, { recursive: true });

  // Hero still context: no video recording, just the crisp 2x top screenshot.
  const shotCtx = await browser.newContext({
    viewport: { width: VIEW_W, height: VIEW_H },
    deviceScaleFactor: 2,
  });
  const shotPage = await shotCtx.newPage();
  let still;
  try {
    await shotPage.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await shotPage.waitForTimeout(2500);
    still = path.join(work, `${slug}-top.png`);
    await shotPage.screenshot({ path: still });
  } catch (err) {
    console.log(`skip   ${url} (hero still): ${String(err).split("\n")[0]}`);
  } finally {
    await shotCtx.close();
  }
  if (!still) continue;

  // Scroll context: dedicated recording; the pre-warm scroll keeps lazy
  // images loaded and reveal states pinned, all BEFORE the filmed pass -
  // and the encoder takes only the LAST 7s of the recording (-sseof), so
  // warmup frames can never leak into the output (no white flashes).
  const videoDir = path.join(work, "video");
  mkdirSync(videoDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: VIEW_W, height: VIEW_H },
    deviceScaleFactor: 2,
    recordVideo: { dir: videoDir, size: { width: VIEW_W, height: VIEW_H } },
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
    await page.waitForTimeout(1000);
    // Pre-warm: full-page pass so lazy images load + reveals trigger.
    await page.evaluate(() =>
      new Promise((resolve) => {
        const step = innerHeight * 0.8;
        let y = 0;
        const t = setInterval(() => {
          y += step;
          scrollTo(0, y);
          if (y > document.body.scrollHeight + step) {
            clearInterval(t);
            resolve();
          }
        }, 110);
      }),
    );
    await page.waitForTimeout(2000);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(900);
    // Filmed pass: eased 3.8s from the top, then a settle hold.
    await page.evaluate((ms) => {
      const startY = scrollY;
      const dist = Math.max(0, document.body.scrollHeight - innerHeight - startY);
      const t0 = performance.now();
      const ease = (t) => t * t * (3 - 2 * t);
      return new Promise((resolve) => {
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / ms);
          scrollTo(0, startY + dist * ease(t));
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    }, 3800);
    await page.waitForTimeout(2000);
    await page.close();
    const videoPath = await page.video()?.path();
    await ctx.close();
    if (!videoPath || !existsSync(videoPath)) throw new Error("no video");

    const scrollDest = path.join(OUT_DIR, `web-${slug}-scroll.mp4`);
    execFileSync(ffmpegPath, [
      "-y", "-sseof", "-7", "-i", videoPath,
      "-t", "7", "-an",
      "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,eq=brightness=-0.04:saturation=1.05",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-movflags", "+faststart",
      scrollDest,
    ]);
    const heroDest = path.join(OUT_DIR, `web-${slug}-hero.mp4`);
    heroFromStills(still, heroDest);
    console.log(`shot   web-${slug}-{hero,scroll}.mp4 <- ${url}`);
    takes += 2;
    rmSync(work, { recursive: true, force: true });
  } catch (err) {
    console.log(`skip   ${url}: ${String(err).split("\n")[0]}`);
    await ctx.close().catch(() => {});
  }
}

await browser.close();
console.log(`done: ${takes} site takes`);
