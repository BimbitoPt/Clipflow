/**
 * Dogfood export: drives the real Clipflow studio in Chromium and saves a
 * finished MP4. The landing hero is a genuine product export, not a mock.
 *
 * Usage (from repo root, dev server running on :8081):
 *   node scripts/dogfood-hero.mjs "Your idea here." landing/public/brand/hero.mp4 [--silent]
 */
import { chromium } from "playwright";
import path from "node:path";

const [, , idea, out, flag] = process.argv;
if (!idea || !out) {
  console.error('Usage: node scripts/dogfood-hero.mjs "idea" <out.mp4> [--silent]');
  process.exit(2);
}

const PROFILE = {
  Niche: "Short-form video tools",
  Audience: "Solo creators",
  Offer: "a local-first studio that turns one line into a finished short",
  Tone: "Direct and practical.",
  Proof: "Exports real 720p MP4s on your machine.",
};

const browser = await chromium.launch({
  headless: false,
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ acceptDownloads: true });
try {
  await page.goto("http://localhost:8081/", { waitUntil: "load", timeout: 60000 });
  const box = page.getByPlaceholder("What should this video say?");
  await box.waitFor({ timeout: 60000 });
  // Clipflow pack + Clipflow brand context: the hero sells Clipflow itself.
  await page.getByLabel("Niche pack").selectOption("clipflow");
  await page.locator(".cf-profile summary").click();
  for (const [label, value] of Object.entries(PROFILE)) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await box.fill(idea);
  // Script panel appears once the idea builds.
  await page.locator(".cf-script-panel").waitFor({ timeout: 60000 });
  // Let preview + assets settle.
  await page.waitForTimeout(5000);
  if (flag === "--silent") {
    const voice = page.getByText("Voiceover", { exact: false });
    void voice;
    const checkbox = page.locator(".cf-export-controls input[type=checkbox]").first();
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  const exportButton = page.getByRole("button", { name: /EXPORT 9:16 MP4/ });
  await exportButton.scrollIntoViewIfNeeded();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30 * 60 * 1000 }),
    exportButton.click(),
  ]);
  const dest = path.resolve(out);
  await download.saveAs(dest);
  console.log(`Saved ${dest}`);
} finally {
  await browser.close();
}
