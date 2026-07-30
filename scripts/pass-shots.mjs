// Captures du train qui traverse la voie d'en face.
//
// Le passage dure une quinzaine de secondes et ne se déclenche que dans un
// creux : impossible à attraper en attendant qu'il arrive, et impossible à
// photographier au vol - sous SwiftShader une frame dure plus d'une seconde,
// pendant laquelle la rame parcourt trente mètres. On la FIGE donc en place
// (`__passRate(0)`), on repose l'état de la gare à chaque déclenchement, et on
// laisse passer une frame avant de capturer.
//
//   node scripts/pass-shots.mjs /tmp/passage [index de gare]
//
// Gare par défaut : JY04 御徒町 (index 3), l'une des cinq que le rapide de la
// Keihin-Tōhoku traverse sans s'arrêter.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/passage';
const STATION = Number(process.argv[3] ?? 3);
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5204 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('  ⚠ console :', m.text());
});
await page.goto('http://localhost:5204/', { waitUntil: 'networkidle' });
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
await page.waitForFunction(() => typeof window.__passAt === 'function', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
await page.addStyleTag({ content: '.app > :not(:first-child){display:none !important}' });

// La caméra libre est posée dans le repère du MONDE : sur une gare dont le côté
// d'ouverture est −1 (Hamamatsuchō, Yūrakuchō…), la gare entière est retournée
// et tout est à changer de signe. On le lit sur la rame elle-même, une fois
// construite, plutôt que de recopier ici la table des côtés d'ouverture.
await page.evaluate((i) => {
  window.__probeGoto(i, 'dwell');
  window.__passRate(0);
  window.__passAt(0);
}, STATION);
await new Promise((r) => setTimeout(r, 1600));
const s = await page.evaluate(() => {
  const r = window.__passConsist;
  r.updateWorldMatrix(true, true);
  return r.getWorldPosition(new r.position.constructor()).x < 0 ? -1 : 1;
});

// [nom, abscisse du NEZ le long de la voie, caméra, cible]
const views = [
  ['bord-de-quai', -60, [7.6, 1.6, 8], [9.9, 1.4, -30]],
  ['milieu-quai', -70, [4.5, 1.6, 0], [9.86, 1.2, -26]],
  ['depuis-la-porte', -30, [1.9, 1.6, 2.5], [9.86, 1.7, -12]],
];

for (const [name, nose, cam, target] of views) {
  const pose = { x: s * cam[0], y: cam[1], z: s * cam[2], tx: s * target[0], ty: target[1], tz: s * target[2] };
  // Deux passes : la première construit la rame (elle naît à l'annonce), la
  // seconde repose l'état pour la frame qui sera effectivement capturée.
  for (let k = 0; k < 2; k++) {
    await page.evaluate(
      ([i, p, z]) => {
        window.__freeCam(p);
        window.__probeGoto(i, 'dwell');
        window.__runtime.phaseT = 6;
        window.__probeClock(12 * 60);
        window.__passRate(0);
        window.__passAt(z);
      },
      [STATION, pose, nose],
    );
    await new Promise((r) => setTimeout(r, 1600));
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('→', name);
}

await browser.close();
await server.close();
