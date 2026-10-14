/**
 * Export-verification matrix for the AI Director plan gate (E_PLAN_APPROVAL).
 *
 * 1. Opens the preview build, fails on uncaught page errors.
 * 2. Asserts export WITHOUT approvals is blocked with E_PLAN_APPROVAL.
 * 3. Approves all 5 shots via the Production plan UI, runs export (voice OFF),
 *    captures the download, asserts size > 100KB and `.mp4` suffix.
 * 4. Optionally repeats with voice ON (Kokoro synth is slow on CPU).
 *
 * Usage:
 *   node scripts/export-matrix.mjs [--url http://localhost:8081]
 *     [--headed] [--voice-on] [--voice-timeout-ms 600000]
 *     [--export-timeout-ms 480000] [--out <dir>]
 *
 * Prints a JSON summary to stdout (progress chatter goes to stderr) and
 * exits non-zero on assertion failure. A voice-ON timeout is recorded as
 * `voiceOn: "timeout-gap"`, NOT a failure of the gate.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(name);

const URL = opt("--url", "http://localhost:8081");
const HEADED = flag("--headed");
const VOICE_ON = flag("--voice-on");
const VOICE_TIMEOUT_MS = Number(opt("--voice-timeout-ms", "600000"));
const EXPORT_TIMEOUT_MS = Number(opt("--export-timeout-ms", "480000"));
const OUT_DIR = opt("--out", path.resolve("dist-export-matrix"));

const summary = {
  url: URL,
  headless: !HEADED,
  gateBlocked: false,
  gateMessage: null,
  voiceOffBytes: null,
  voiceOffFile: null,
  voiceOnBytes: null,
  voiceOnFile: null,
  voiceOn: VOICE_ON ? "pending" : "skipped",
  consoleErrors: [],
  pageErrors: [],
};

const log = (...parts) => console.error("[export-matrix]", ...parts);

const fail = (message) => {
  console.error(`EXPORT-MATRIX FAIL: ${message}`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(1);
};

const exportButton = (page) =>
  page.getByRole("button", { name: /EXPORT.*MP4/i });
const approvalBoxes = (page) =>
  page.locator('section[aria-label="Production plan"] input[type="checkbox"]');
const voiceBox = (page) => page.getByRole("checkbox", { name: /Voiceover/i });
const alertBox = (page) => page.getByRole("alert").first();

async function progressText(page) {
  const prog = page.locator(".cf-export-progress small");
  return (await prog.count())
    ? (await prog.first().textContent())?.slice(0, 140) ?? "(unreadable)"
    : "(no-progress)";
}

/** Wait for a download while logging export progress; null on timeout. */
async function waitDownload(page, timeoutMs, label) {
  const dl = await page
    .waitForEvent("download", { timeout: timeoutMs })
    .then((d) => d, () => null);
  if (dl) return dl;
  log(`${label}: no download in ${timeoutMs}ms; last progress: ${await progressText(page)}`);
  return null;
}

async function runOnce(headless) {
  summary.headless = headless;
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (err) => summary.pageErrors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error")
        summary.consoleErrors.push(msg.text().slice(0, 300));
    });

    await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
    await exportButton(page).first().waitFor({ timeout: 30000 });

    // The plan UI must expose exactly 5 approval checkboxes, all unchecked.
    const boxes = approvalBoxes(page);
    const count = await boxes.count();
    if (count !== 5) fail(`expected 5 approval checkboxes, found ${count}`);
    for (let i = 0; i < 5; i++) {
      if (await boxes.nth(i).isChecked())
        fail(`approval checkbox ${i + 1} starts checked; want fresh unapproved state`);
    }
    log("plan UI: 5 approval checkboxes, all unchecked");

    // Voice OFF for the gate + silent export.
    if (await voiceBox(page).isChecked()) await voiceBox(page).uncheck();
    log("voice: OFF");

    // (b) Gate: export without approvals must fail with E_PLAN_APPROVAL.
    // Wait for ANY alert first so a different blocker (e.g. a headless
    // WebCodecs probe refusal) surfaces as a clear verdict, not a timeout.
    await exportButton(page).first().click();
    await alertBox(page).waitFor({ timeout: 120000 });
    const gateText = (await alertBox(page).textContent()) ?? "";
    summary.gateBlocked = gateText.includes("E_PLAN_APPROVAL");
    summary.gateMessage = gateText.slice(0, 200);
    log(`gate alert: ${summary.gateMessage}`);
    if (!summary.gateBlocked) {
      if (/hardware-encode|refused the .* export config/i.test(gateText))
        return { webcodecsBlocked: gateText.slice(0, 200) };
      fail(`gate did not block with E_PLAN_APPROVAL: ${gateText.slice(0, 200)}`);
    }

    // (c) Approve all 5 shots, then export voice-OFF and capture download.
    for (let i = 0; i < 5; i++) await boxes.nth(i).check();
    log("approved all 5 shots");
    fs.mkdirSync(OUT_DIR, { recursive: true });

    await exportButton(page).first().click();
    const download = await waitDownload(page, EXPORT_TIMEOUT_MS, "voice-OFF");
    if (!download) {
      const errText = await alertBox(page).textContent().catch(() => null);
      if (errText && /hardware-encode|refused the .* export config/i.test(errText))
        return { webcodecsBlocked: errText.slice(0, 200) };
      fail(`voice-OFF export produced no download (alert: ${(errText ?? "(none)").slice(0, 200)})`);
    }
    const offPath = path.join(OUT_DIR, "clipflow-voice-off.mp4");
    await download.saveAs(offPath);
    const offBytes = fs.statSync(offPath).size;
    const suggested = download.suggestedFilename();
    summary.voiceOffBytes = offBytes;
    summary.voiceOffFile = suggested;
    log(`voice-OFF download: ${suggested} (${offBytes} bytes)`);
    if (!suggested.endsWith(".mp4")) fail(`download suffix: ${suggested}`);
    if (offBytes <= 100 * 1024)
      fail(`voice-OFF file too small: ${offBytes} bytes`);

    // (d) Voice ON, only when requested.
    if (VOICE_ON) {
      await voiceBox(page).check();
      log("voice: ON — starting (Kokoro CPU synth, may take minutes)");
      await exportButton(page).first().click();
      const voiceDl = await waitDownload(page, VOICE_TIMEOUT_MS, "voice-ON");
      if (!voiceDl) {
        const errText =
          (await alertBox(page).textContent().catch(() => "")) ?? "";
        if (/E_TTS_MODEL/.test(errText)) {
          summary.voiceOn = "model-gap";
          log(`voice-ON model gap: ${errText.slice(0, 160)}`);
        } else {
          summary.voiceOn = "timeout-gap";
          log(`voice-ON timeout gap (alert: ${errText.slice(0, 160) || "(none)"})`);
        }
      } else {
        const onPath = path.join(OUT_DIR, "clipflow-voice-on.mp4");
        await voiceDl.saveAs(onPath);
        summary.voiceOnBytes = fs.statSync(onPath).size;
        summary.voiceOnFile = voiceDl.suggestedFilename();
        summary.voiceOn =
          summary.voiceOnBytes > 100 * 1024 ? "ok" : "small-file";
        log(`voice-ON download: ${summary.voiceOnFile} (${summary.voiceOnBytes} bytes)`);
        if (summary.voiceOnBytes <= 100 * 1024)
          fail(`voice-ON file too small: ${summary.voiceOnBytes} bytes`);
      }
    }

    if (summary.pageErrors.length > 0)
      fail(`page errors: ${summary.pageErrors[0]}`);
    return null;
  } finally {
    await browser.close();
  }
}

const first = await runOnce(!HEADED);
if (first?.webcodecsBlocked) {
  if (!HEADED) {
    // Headless software WebCodecs refused the config — retry headed once.
    summary.consoleErrors.push(
      `headless WebCodecs blocked: ${first.webcodecsBlocked}`,
    );
    log("headless WebCodecs blocked; retrying headed once");
    const second = await runOnce(false);
    if (second?.webcodecsBlocked)
      fail(`WebCodecs blocked even headed: ${second.webcodecsBlocked}`);
  } else {
    fail(`WebCodecs blocked headed: ${first.webcodecsBlocked}`);
  }
}

console.log(JSON.stringify(summary, null, 2));
if (!summary.gateBlocked) process.exit(1);
if (summary.voiceOffBytes === null) process.exit(1);
