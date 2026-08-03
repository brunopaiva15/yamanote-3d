// LA MÊME GARE, AUX QUATRE PALIERS DE QUALITÉ.
//
//   node scripts/station-tiers.mjs /tmp/paliers 4 24
//
// Un palier de qualité doit retirer CE QU'ON REGARDE, jamais ce qu'on parcourt
// ni ce qui barre (règle de la phase 25). Cela ne se démontre pas en lisant des
// `detail <= 2` un par un : il faut voir la même vue aux quatre paliers, côte à
// côte, et compter ce que chacun coûte.
//
// Les quatre paliers sont ceux que le joueur choisit : ultra, moyenne, basse,
// très basse. Les deux derniers partagent le même détail de gare (3) mais pas
// la même résolution ni la même densité de foule — c'est bien la GARE qu'on
// compare ici, pas le rendu.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args.find((a) => !/^\d+$/.test(a)) ?? '/tmp/paliers';
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
const stations = only.length ? only : [4];
const TIERS = ['ultra', 'medium', 'low', 'veryLow'];
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5213 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5213/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent);
  b.sort((a, c) => c.offsetWidth * c.offsetHeight - a.offsetWidth * a.offsetHeight);
  b[0]?.click();
});
await page.waitForFunction(() => typeof window.__probeQuality === 'function', { timeout: 30000 });
await page.addStyleTag({ content: '.app > :not(:first-child){display:none !important}' });

console.log('\n  gare            palier      vue              maillages   appels');
for (const i of stations) {
  await page.evaluate((n) => window.__probeGoto(n), i);
  await new Promise((r) => setTimeout(r, 1000));
  const name = await page.evaluate(() => window.__probeName());
  const { placement } = await page.evaluate(() => window.__probeInterior());
  for (const tier of TIERS) {
    await page.evaluate((q) => window.__probeQuality(q), tier);
    await new Promise((r) => setTimeout(r, 1400));
    for (const [leg, fx, fz, tx, tz] of placement) {
      // Le quai d'abord — c'est de là qu'on voit si le hall existe —, puis la
      // zone payante, où l'on est dedans.
      if (!/^0[12]-/.test(leg)) continue;
      const level = leg.startsWith('01') ? 'platform' : 'concourse';
      await page.evaluate(([x, z, l]) => window.__probeStand(x, z, l), [fx, fz, level]);
      await page.evaluate(([x, z]) => window.__lookAt(x, z), [tx, tz]);
      await new Promise((r) => setTimeout(r, 900));
      await page.evaluate(() => {
        window.__probePerfReset();
        window.__frames = 0;
        const loop = () => { window.__frames++; requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      });
      await new Promise((r) => setTimeout(r, 2200));
      const raw = await page.evaluate(() => ({ ...window.__probePerf(), frames: window.__frames }));
      const f = Math.max(1, raw.frames);
      console.log(
        `  ${name.padEnd(16)}${tier.padEnd(12)}${leg.padEnd(17)}`
        + `${String(raw.meshes).padStart(9)}${String(Math.round(raw.calls / f)).padStart(9)}`,
      );
      await page.screenshot({ path: `${out}/${String(i + 1).padStart(2, '0')}-${name}-${leg}-${tier}.png` });
    }
  }
}

await browser.close();
await server.close();
