// Ce que le paysage coûte, palier de qualité par palier de qualité.
//
//   node scripts/scenery-cost.mjs
//
// Les chiffres relevés — appels de rendu, triangles, programmes — ne dépendent
// pas de la carte graphique : on peut donc les prendre sous SwiftShader et en
// tirer un budget valable partout. Le temps par image, lui, n'y voudrait rien
// dire, et n'est pas relevé.
//
// Deux points de mesure par palier : en pleine voie (le décor seul) et à quai
// (la gare, la foule et l'extérieur de la rame s'ajoutent) — c'est là que la
// scène est la plus lourde.

import { chromium } from 'playwright';
import { createServer } from 'vite';

const QUALITIES = ['ultra', 'veryHigh', 'high', 'medium', 'low', 'veryLow'];

const server = await createServer({ root: process.cwd(), server: { port: 5205 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));

const rows = [];
for (const q of QUALITIES) {
  await page.goto('http://localhost:5205/', { waitUntil: 'networkidle' });
  await page.evaluate((quality) => {
    try {
      localStorage.setItem('yamanote.quality', quality);
    } catch {
      /* mode privé */
    }
  }, q);
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent);
    b.sort((a, c) => c.offsetWidth * c.offsetHeight - a.offsetWidth * a.offsetHeight);
    b[0]?.click();
  });
  await page.waitForFunction(() => typeof window.__probePerf === 'function', { timeout: 30000 });

  for (const [where, setup] of [
    ['voie', () => window.__probeCruise(16)],
    ['quai', () => window.__probeGoto(16, 'dwell')],
  ]) {
    await page.evaluate(setup);
    await new Promise((r) => setTimeout(r, 2000));
    // Cumuler sur un nombre d'images connu : une image seule n'est pas lisible
    // quand le post-traitement enchaîne plusieurs passes.
    await page.evaluate(() => {
      window.__probePerfReset();
      window.__frames = 0;
      const loop = () => {
        window.__frames++;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await new Promise((r) => setTimeout(r, 6000));
    const raw = await page.evaluate(() => ({ ...window.__probePerf(), frames: window.__frames }));
    const f = Math.max(1, raw.frames);
    rows.push({
      quality: q,
      where,
      ...raw,
      calls: Math.round(raw.calls / f),
      triangles: Math.round(raw.triangles / f),
    });
  }
}

const fmt = (n) => String(n).padStart(8);
console.log('\n qualité     où     appels  triangles  progr.  géom.  text.  maillages  instanciés  instances');
for (const r of rows) {
  console.log(
    ` ${r.quality.padEnd(10)} ${r.where.padEnd(6)}${fmt(r.calls)}${fmt(r.triangles)}${fmt(r.programs)}${fmt(r.geometries)}${fmt(r.textures)}${fmt(r.meshes)}${fmt(r.instanced)}${fmt(r.instances)}`,
  );
}

await browser.close();
await server.close();
