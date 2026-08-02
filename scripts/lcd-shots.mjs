// Captures des vues de l'écran de ligne, à leur résolution native (768 × 432),
// pour les comparer aux captures de l'afficheur réel.
//
//   node scripts/lcd-shots.mjs /tmp/lcd [index de gare] [phase] [sens]
//
// Gare par défaut : JY01 東京, à quai - c'est l'état des photos de référence.
// Chaque vue sort en PNG 1:1 : aucun redimensionnement entre le canevas et le
// fichier, sinon la comparaison au pixel ne veut plus rien dire.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/lcd';
const station = Number(process.argv[3] ?? 0);
const phase = process.argv[4] ?? 'dwell';
const dir = process.argv[5] ?? 'inner';
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5209 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));

await page.goto(`http://localhost:5209/lcd-probe.html?station=${station}&phase=${phase}&dir=${dir}`, {
  waitUntil: 'networkidle',
});
await page.waitForSelector('canvas[data-view]');
await page.evaluate(() => document.fonts.ready);

for (const el of await page.$$('canvas[data-view]')) {
  const name = await el.evaluate((c) => c.dataset.view);
  await el.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
}

await browser.close();
await server.close();
