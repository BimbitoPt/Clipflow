import { chromium } from '@playwright/test';
import path from 'node:path';

const out = path.resolve('remotion-studio/public/proof-screens');
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 860, height: 720 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });
// The local Clipflow app opens with a MStudio demo profile. Keep the offer field
// aligned with the live MStudio pricing page before capturing this workflow.
await page.getByLabel('Offer').fill('fixed-price Speed Site, AI Automation Build and Premium Bundle');
await page.waitForTimeout(600);
for (const [name, locator] of [
  ['clipflow-idea', page.getByRole('heading', { name: 'Idea' })],
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
const mobile = await browser.newPage({ viewport: { width: 420, height: 780 }, deviceScaleFactor: 2 });
await mobile.goto('http://localhost:8081', { waitUntil: 'networkidle' });
await mobile.getByLabel('Offer').fill('fixed-price Speed Site, AI Automation Build and Premium Bundle');
await mobile.waitForTimeout(400);
const script = mobile.locator('section').filter({ has: mobile.getByRole('heading', { name: 'Script' }) }).first();
await script.scrollIntoViewIfNeeded();
const box = await script.boundingBox();
if (!box) throw new Error('Clipflow script panel is missing');
await mobile.screenshot({ path: path.join(out, 'clipflow-script-top.png'), clip: { x: box.x, y: box.y, width: box.width, height: 220 } });
await mobile.screenshot({ path: path.join(out, 'clipflow-script-bottom.png'), clip: { x: box.x, y: box.y + 205, width: box.width, height: 235 } });
await browser.close();
