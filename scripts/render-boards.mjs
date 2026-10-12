import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "outputs", "boards");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 1400 }, deviceScaleFactor: 2 });
await page.goto("file:///" + path.join(root, ".fx-tmp", "boards.html").replace(/\\/g, "/"));
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(outDir, "clipflow-boards.png") });
// Split top strip / hero for flexible use
await page.screenshot({ path: path.join(outDir, "clipflow-boards-top.png"), clip: { x: 0, y: 0, width: 1536, height: 640 } });
await page.screenshot({ path: path.join(outDir, "clipflow-boards-hero.png"), clip: { x: 0, y: 640, width: 1536, height: 760 } });
await browser.close();
console.log("boards done: " + outDir);
