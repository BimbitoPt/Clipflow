import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('remotion-studio/public/proof-screens');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? String.raw`C:\Users\Guilh\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe` });
const pages = [
  ['home', 'https://www.mstudioweb.pt/'],
  ['pricing', 'https://www.mstudioweb.pt/pricing'],
  ['services', 'https://www.mstudioweb.pt/services'],
  ['contact', 'https://www.mstudioweb.pt/contact'],
];
for (const [key, url] of pages) {
  const page = await browser.newPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, `mstudio-${key}-hero.png`), animations: 'disabled' });
  if (key === 'pricing') {
    for (const [name, heading] of [['speed', 'Speed Site'], ['automation', 'AI Automation Build'], ['ownership', 'You own what we build.']]) {
      await page.getByRole('heading', { name: heading, exact: true }).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, `mstudio-${name}.png`), animations: 'disabled' });
    }
  }
  await page.close();
}
await browser.close();
