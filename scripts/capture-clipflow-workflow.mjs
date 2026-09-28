import { chromium } from '@playwright/test';
import path from 'node:path';

const out = path.resolve('remotion-studio/public/proof-screens');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? String.raw`C:\Users\Guilh\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe` });
const page = await browser.newPage({ viewport: { width: 860, height: 720 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });
// The local Clipflow app opens with a MStudio demo profile. Keep the offer field
// aligned with the live MStudio pricing page before capturing this workflow.
await page.getByLabel('Offer').fill('fixed-price Speed Site, AI Automation Build and Premium Bundle');
await page.waitForTimeout(600);
for (const [name, locator] of [
  ['clipflow-idea', page.getByRole('heading', { name: 'Idea' })],
  ['clipflow-script', page.getByRole('heading', { name: 'Script' })],
  ['clipflow-export', page.getByRole('button', { name: /Export clipflow-916/ })],
]) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled' });
}
await page.locator('canvas').first().screenshot({ path: path.join(out, 'clipflow-preview.png'), animations: 'disabled' });
const caption = page.locator('details').filter({ has: page.locator('summary:text-is("TikTok caption")') }).first();
await caption.locator('summary').click();
await caption.scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(out, 'clipflow-caption.png'), animations: 'disabled' });
await browser.close();
