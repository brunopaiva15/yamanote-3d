// Captures du temps qu'il fait, depuis le wagon.
//
//   node scripts/weather-shots.mjs /tmp/meteo
//
// Deux choses se jugent ici, et une seule est la pluie elle-même :
//
//   · les gouttes — leur inclinaison surtout, qui doit suivre la vitesse du
//     train, et leur absence sous le pavillon du wagon ;
//   · TOUT LE RESTE — la portée du regard qui tombe, le ciel qui se ferme, le
//     ballast et la chaussée qui foncent, la neige qui blanchit ce qui regarde
//     le ciel. C'est ce reste qui fait qu'il pleut ; les gouttes ne font que
//     le confirmer.
//
// L'épisode est GELÉ (`__probeWeather`) : sans quoi le modèle reprendrait la
// main à l'image suivante et ramènerait le temps du jour.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/meteo';
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5205 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  ⚠ console :', m.text()); });
await page.goto('http://localhost:5205/', { waitUntil: 'networkidle' });

await page.evaluate(() => {
  try { localStorage.setItem('yamanote.quality', 'high'); } catch { /* mode privé */ }
});
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
  btns.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  btns[0]?.click();
});
await page.waitForFunction(() => typeof window.__probeWeather === 'function', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
await page.addStyleTag({ content: '.app > :not(:first-child){display:none !important}' });

await page.mouse.move(480, 270);
await page.mouse.down();
await page.mouse.move(480 - 230, 270 + 15, { steps: 3 });
await page.mouse.up();

/** Harajuku → Shibuya, au niveau du sol : le tronçon le plus lisible. */
const STATION = 19;
/** Même abscisse pour toutes les prises : les mêmes immeubles, à chaque fois. */
const DIST = 640;

const cases = [
  ['degage', 6, 20, 13 * 60, { cloud: 0.05, rain: 0, snow: 0, wet: 0, snowCover: 0, visibility: 1 }],
  ['tsuyu-bruine', 6, 20, 13 * 60, { cloud: 0.9, rain: 0.25, snow: 0, wet: 0.5, snowCover: 0, visibility: 0.78 }],
  ['averse', 6, 20, 13 * 60, { cloud: 1, rain: 1, snow: 0, wet: 1, snowCover: 0, visibility: 0.42 }],
  ['orage-nuit', 8, 15, 20 * 60, { cloud: 1, rain: 0.9, snow: 0, wet: 1, snowCover: 0, visibility: 0.45 }],
  ['neige', 2, 8, 9 * 60, { cloud: 0.95, rain: 0, snow: 0.8, wet: 0.4, snowCover: 0.85, visibility: 0.6 }],
  ['neige-nuit', 2, 8, 19 * 60, { cloud: 0.95, rain: 0, snow: 0.7, wet: 0.4, snowCover: 0.9, visibility: 0.6 }],
];

for (const [name, month, day, clock, w] of cases) {
  await page.evaluate(([i, m, d, c, dist, patch]) => {
    window.__probeCruise(i);
    window.__probeDate(m, d);
    window.__probeClock(c);
    window.__probeDistance(dist);
    window.__probeWeather(patch);
  }, [STATION, month, day, clock, DIST, w]);
  await new Promise((r) => setTimeout(r, 1800));
  // Re-poser juste avant : sous SwiftShader le cycle file pendant les temps
  // morts, et la distance aurait bougé de plusieurs cellules.
  await page.evaluate(([dist, patch]) => {
    window.__probeDistance(dist);
    window.__probeWeather(patch);
  }, [DIST, w]);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('→', name);
}

// À l'arrêt en gare, la pluie se redresse : le terme de vitesse tombe. C'est la
// vérification la plus importante du lot, et la seule qui demande un arrêt.
await page.evaluate(([i, patch]) => {
  window.__probeGoto(i);
  window.__probeClock(13 * 60);
  window.__probeDate(6, 20);
  window.__probeWeather(patch);
}, [STATION, { cloud: 1, rain: 0.85, snow: 0, wet: 1, snowCover: 0, visibility: 0.5 }]);
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: `${out}/averse-a-quai.png` });
console.log('→ averse-a-quai');

await browser.close();
await server.close();
