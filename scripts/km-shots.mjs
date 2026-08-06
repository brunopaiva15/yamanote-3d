// Captures par point kilométrique de la bible.
//
//   node scripts/km-shots.mjs /tmp/km [km0 km1 …]
//
// Sans liste, on prend une douzaine de KM représentatifs (Shinagawa, Shibuya,
// Shinjuku, Ikebukuro, Ueno, Tokyo, et quelques entre-deux). Chaque vue vise
// par la baie, caisse en place, qualité high, SwiftShader.
//
// La pose passe par `__probeBible(km)` + `__probeCruise` calé sur la gare
// d'arrivée la plus proche, puis une attente d'images pour laisser converger
// le relief et les masses.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/km';
const asked = process.argv.slice(3).map(Number).filter((n) => Number.isFinite(n));
const KMS = asked.length
  ? asked
  : [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33];
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5211 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/google/chrome/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5211/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  try {
    localStorage.setItem('yamanote.quality', 'high');
  } catch {
    /* mode privé */
  }
});
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
  btns.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  btns[0]?.click();
});
await page.waitForFunction(() => typeof window.__probeBible === 'function', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.addStyleTag({ content: '.app > :not(:first-child){display:none !important}' });

let curDx = 0;
let curDy = 0;
async function aim(dx, dy) {
  const ddx = dx - curDx;
  const ddy = dy - curDy;
  if (!ddx && !ddy) return;
  await page.mouse.move(480, 270);
  await page.mouse.down();
  await page.mouse.move(480 + ddx, 270 + ddy, { steps: 3 });
  await page.mouse.up();
  curDx = dx;
  curDy = dy;
}

for (const km of KMS) {
  const info = await page.evaluate((k) => {
    const b = window.__probeBible(k);
    // Se poser en croisière près de la gare d'arrivée la plus proche du KM.
    const stations = window.__probeName ? null : null;
    void stations;
    return b;
  }, km);
  // La gare d'arrivée : on lit l'index via la sonde bible + une croisière
  // calée sur le numéro JY le plus proche (romaji → index via __probeGoto).
  const arrival = await page.evaluate((romaji) => {
    const list = [
      'Tokyo', 'Kanda', 'Akihabara', 'Okachimachi', 'Ueno', 'Uguisudani', 'Nippori',
      'Nishi-Nippori', 'Tabata', 'Komagome', 'Sugamo', 'Ōtsuka', 'Ikebukuro', 'Mejiro',
      'Takadanobaba', 'Shin-Ōkubo', 'Shinjuku', 'Yoyogi', 'Harajuku', 'Shibuya', 'Ebisu',
      'Meguro', 'Gotanda', 'Ōsaki', 'Shinagawa', 'Takanawa Gateway', 'Tamachi',
      'Hamamatsuchō', 'Shimbashi', 'Yūrakuchō',
    ];
    // Correspondances souples (ō / o, chō / cho).
    const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const i = list.findIndex((n) => norm(n) === norm(romaji));
    if (i >= 0) {
      window.__probeCruise(i);
      window.__probeClock(15 * 60 + 30);
      window.__probeHold?.(true);
    }
    return i;
  }, info.gare);

  await aim(-200, -20);
  await new Promise((r) => setTimeout(r, 1600));
  const tag = `km-${String(km).replace('.', '_')}`;
  await page.screenshot({ path: `${out}/${tag}.png` });
  console.log('→', tag, `gare≈${info.gare}`, `arrivée=${arrival}`, `km=${info.km}`);
}

await browser.close();
await server.close();
console.log('captures dans', out);
