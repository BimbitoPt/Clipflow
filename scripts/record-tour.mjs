/**
 * Record a full working tour of the Clipflow studio as a vertical video.
 *
 * Drives the REAL local app (idea → beats → live frame → export): types an
 * idea with visible keystrokes, scrolls the beat stack, flips a live-frame
 * beat, and lands on the export CTA. No clicks that trigger renders.
 *
 * Usage: node scripts/record-tour.mjs
 * Output: outputs/mockups/clipflow-tour.mp4 (720x1280, 30fps, 24s, silent)
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "@playwright/test";

const root = process.cwd();
const outDir = path.join(root, "outputs", "mockups");
mkdirSync(outDir, { recursive: true });

const PORT = "8091";
const server = spawn("cmd.exe", ["/c", `npm run dev -- --port ${PORT} --strictPort`], {
  cwd: root,
  stdio: "ignore",
});

function kill() {
  try {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // ignore
  }
}

async function waitForServer(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error("studio dev server never came up");
}

async function smoothTo(pg, y, ms = 1400) {
  await pg.evaluate(
    ([target, dur]) =>
      new Promise((done) => {
        const from = window.scrollY;
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur);
          const e = 1 - Math.pow(1 - k, 3);
          window.scrollTo(0, from + (target - from) * e);
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [y, ms],
  );
}

async function yOf(pg, selector, fallback) {
  try {
    const box = await pg.locator(selector).first().boundingBox({ timeout: 4000 });
    if (box) return Math.max(0, box.y - 260);
  } catch {
    // fall through
  }
  return fallback;
}

let code = 1;
try {
  await waitForServer();
  const b = await chromium.launch();
  // Warm-up pass (no recording): force cold vite to compile the whole studio
  // graph before the take starts, or the first ~30s record pure white.
  const warm = await b.newPage();
  await warm.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await warm.getByRole("heading", { name: /your idea/i }).first().waitFor({ timeout: 180000 });
  await warm.waitForTimeout(1500);
  await warm.close();
  console.log("[tour] server warm, rolling");
  const pg = await b.newPage({
    viewport: { width: 720, height: 1280 },
    recordVideo: { dir: outDir, size: { width: 720, height: 1280 } },
  });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  pg.on("crash", () => errs.push("TAB CRASHED"));
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(3500); // settle on hero (model fetches keep network busy)

  // 1. Idea: clear + type with visible keystrokes (no stability waits —
  // background model fetches keep layout shifting, so drive by coordinates).
  try {
    const idea = pg.getByLabel("What should this video say?");
    const box = await idea.boundingBox({ timeout: 15000 });
    if (!box) throw new Error("idea box has no geometry");
    await smoothTo(pg, Math.max(0, box.y - 420), 900);
    await pg.waitForTimeout(400);
    await idea.fill("", { force: true });
    await idea.pressSequentially("Editing a 30 second short still eats two hours.", { delay: 55 });
    await pg.waitForTimeout(900);
  } catch (e) {
    console.log(`[tour] idea step skipped: ${String(e).split("\n")[0]}`);
  }

  // 2. Beats: glide to the hook script.
  await smoothTo(pg, await yOf(pg, 'textarea[aria-label="Hook script"]', 1500));
  await pg.waitForTimeout(2600);

  // 3. Live frame: back up to the canvas, flip a beat to prove it is live.
  await smoothTo(pg, await yOf(pg, "canvas", 500));
  await pg.waitForTimeout(1800);
  try {
    await pg.getByText("BEAT 02", { exact: false }).click({ timeout: 4000 });
    await pg.waitForTimeout(2200);
  } catch (e) {
    console.log(`[tour] beat flip skipped: ${String(e).split("\n")[0]}`);
  }

  // 4. Export: land on the CTA and hold (hover only — never render on tour).
  await smoothTo(pg, await yOf(pg, 'button:has-text("EXPORT 9:16")', 4000), 1600);
  await pg.waitForTimeout(2600);

  const webm = await pg.video().path();
  await pg.close();
  if (errs.length > 0) {
    console.error(`[tour] page errors:\n${errs.join("\n")}`);
    process.exit(2);
  }
  await b.close();

  const out = path.join(outDir, "clipflow-tour.mp4");
  const res = spawnSync(
    ffmpegPath,
    ["-y", "-i", webm, "-vf", "fps=30,scale=720:1280,setsar=1", "-t", "24",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-an", out],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    console.error(`[tour] convert failed\n${(res.stderr ?? "").slice(-500)}`);
    process.exit(1);
  }
  console.log("[tour] wrote outputs/mockups/clipflow-tour.mp4");
  code = 0;
} finally {
  kill();
}
process.exit(code);
