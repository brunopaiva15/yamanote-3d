// Rend l'habillage du film (film-overlay.html) en PNG transparents, une image
// par 1/30 s, prêts à être posés sur les plans par compose.mjs.
//
//   node scripts/film/overlay.mjs <dossier>              toutes les images
//   node scripts/film/overlay.mjs <dossier> --at 1,5.2   quelques instants,
//                                                        sur fond gris, pour régler

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const out = args[0];
const atArg = args.includes('--at') ? args[args.indexOf('--at') + 1] : null;
const fps = 30;
mkdirSync(out, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  server: { port: 5320, hmr: false, watch: null },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => console.error('  ⚠ page :', e.message));
await page.goto(`http://localhost:5320/film-overlay.html${atArg ? '?bg=1' : ''}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__overlayReady === true);
await page.evaluate(() => document.fonts.ready);
const total = await page.evaluate(() => window.__overlay.total);

const times = atArg
  ? atArg.split(',').map(Number)
  : Array.from({ length: Math.round(total * fps) }, (_, f) => f / fps);
for (let i = 0; i < times.length; i++) {
  const t = times[i];
  await page.evaluate((x) => window.__overlay.set(x), t);
  const name = atArg ? `t${t.toFixed(2)}.png` : `${String(i + 1).padStart(4, '0')}.png`;
  await page.screenshot({ path: join(out, name), omitBackground: !atArg });
  if (!atArg && i % 60 === 0) console.log(`  habillage ${i + 1}/${times.length}`);
}
await browser.close();
await server.close();
