// Captures du décor extérieur, vues depuis le wagon EN PLEINE VOIE.
//
// La sonde de gare (scripts/station-probe.mjs) se pose à l'arrêt, là où le quai
// masque tout le paysage : elle ne peut rien dire du décor. Celle-ci fait
// l'inverse - on se cale au milieu d'un inter-gare, on vise par une baie, et on
// regarde ce qui défile, de jour comme de nuit.
//
//   node scripts/scenery-shots.mjs /tmp/decor
//
// Le rendu passe par SwiftShader : une frame dure plusieurs secondes, et le
// cycle station file pendant les temps morts (la capture elle-même bloque le
// rendu). D'où la re-pose de l'état juste avant chaque déclenchement.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/shots';
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5203 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  ⚠ console :', m.text()); });
await page.goto('http://localhost:5203/', { waitUntil: 'networkidle' });

// Qualité « high » : pas d'occlusion ambiante (le poste le plus lourd sous
// SwiftShader), densité de ville quasi pleine.
await page.evaluate(() => {
  try { localStorage.setItem('yamanote.quality', 'high'); } catch { /* mode privé */ }
});
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
  btns.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  btns[0]?.click();
});
await page.waitForFunction(() => typeof window.__probeCruise === 'function', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
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

// L'index est la gare d'ARRIVÉE : le tronçon traversé est index-1.
const cases = [
  [1, 15 * 60 + 30, 'viaduc-jour'],
  [7, 15 * 60 + 30, 'nishinippori-jour'],
  [3, 21 * 60 + 30, 'akihabara-nuit'],
];
// « rasant » plonge vers l'emprise : c'est le seul angle où l'on juge le
// premier plan, celui qui vend la vitesse.
const angles = [
  ['travers', -230, -30],
  ['biais', -140, -30],
  ['rasant', -230, 55],
];

// Deuxième jeu d'angles, caisse effacée. De l'intérieur, le montant de baie,
// la banquette et les poignées mangent les trois quarts de l'image - c'est la
// condition réelle, et c'est bien pour ça qu'on capture d'abord comme ça. Mais
// on n'y voit pas assez pour arbitrer une trame de rues, une couche lointaine
// ou une ligne de toits. `__probeBare` retire la rame le temps de ces trois-là.
const bareAngles = [
  ['nu-travers', -230, -8],
  ['nu-biais', -150, -8],
  ['nu-toits', -230, 34],
];

async function shoot(idx, clock, name, list) {
  for (const [tag, dx, dy] of list) {
    await aim(dx, dy);
    // Re-poser l'état JUSTE avant la capture : sous SwiftShader une frame dure
    // plusieurs secondes et le cycle station file pendant les temps morts.
    await page.evaluate(([i, c]) => {
      window.__probeCruise(i);
      window.__probeClock(c);
    }, [idx, clock]);
    // Les poids de tronçon (segEnv) se fondent en ~2,5 s : laisser converger,
    // sinon la ville n'a pas fini de descendre sous un viaduc.
    await new Promise((r) => setTimeout(r, 1400));
    await page.screenshot({ path: `${out}/${name}-${tag}.png` });
    console.log('→', `${name}-${tag}`);
  }
}

for (const [idx, clock, name] of cases) {
  await shoot(idx, clock, name, angles);
}

await page.evaluate(() => window.__probeBare(true));
for (const [idx, clock, name] of cases) {
  await shoot(idx, clock, name, bareAngles);
}
await page.evaluate(() => window.__probeBare(false));

await browser.close();
await server.close();
