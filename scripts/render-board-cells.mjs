import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "outputs", "boards", "cells");
mkdirSync(outDir, { recursive: true });

const files = ["board-idea.png", "board-script.png", "board-visuals.png", "board-export.png"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
await page.goto("file:///" + path.join(root, ".fx-tmp", "boards-portrait.html").replace(/\\/g, "/"));
await page.waitForTimeout(600);
const slides = page.locator(".slide");
const count = await slides.count();
for (let i = 0; i < count; i++) {
  await slides.nth(i).screenshot({ path: path.join(outDir, files[i] ?? `board-${i}.png`) });
}
await browser.close();
console.log(`board cells done: ${count} -> ${outDir}`);
