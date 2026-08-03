// Captures des publicités procédurales, à leurs formats réels.
//
//   node scripts/ad-shots.mjs /tmp/ads [premier seed] [nombre] [format]
//
// Le format est facultatif : lcd, mado, nakazuri, kaisho, planche. Sans lui,
// les quatre supports sortent d'affilée pour le même jeu de seeds - c'est la
// seule façon de voir tout de suite si une composition qui tient en portrait
// déborde sur une bannière trois fois plus large que haute.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/ads';
const seed = Number(process.argv[3] ?? 0);
const count = Number(process.argv[4] ?? 6);
const format = process.argv[5] ?? '';
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5211 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 1200 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));

const qs = `seed=${seed}&count=${count}${format ? `&format=${format}` : ''}`;
await page.goto(`http://localhost:5211/ad-probe.html?${qs}`, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas[data-view]');
await page.evaluate(() => document.fonts.ready);

for (const el of await page.$$('canvas[data-view]')) {
  const name = await el.evaluate((c) => c.dataset.view);
  await el.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
}

await browser.close();
await server.close();
