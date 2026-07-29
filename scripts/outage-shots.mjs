// Captures de la coupure de caténaire (停電), vue depuis la place du joueur.
//
//   node scripts/outage-shots.mjs /tmp/coupure
//
// L'événement est trop rare pour s'attendre : on le déclenche à la main
// (`__powerOutage`), puis on avance dans sa chronologie en poussant le chrono
// de l'étape en cours (`__outageSkip`). Ce que l'on vient vérifier tient en
// trois questions, et aucune ne se juge sur une seule image :
//
//   • la rame ne devient pas noire — les lampes de secours restent, froides,
//     là où les néons étaient jaunes ;
//   • les dalles LCD et les écrans publicitaires s'éteignent, mais pas les
//     affiches de papier ;
//   • au retour de la tension, tout ne revient pas au même instant.
//
// Le rendu passe par SwiftShader : une frame dure plusieurs secondes, et le
// temps du jeu file pendant les temps morts. D'où le report de l'état juste
// avant chaque déclenchement.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/coupure';
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5207 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('  ⚠ console :', m.text());
});
await page.goto('http://localhost:5207/', { waitUntil: 'networkidle' });

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
await page.waitForFunction(() => typeof window.__powerOutage === 'function', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
await page.addStyleTag({ content: '.app > :not(:first-child){display:none !important}' });

// Vue vers le fond du wagon : on y a d'un coup d'œil le bandeau LED, deux
// dalles au-dessus des portes, les écrans 窓上 et la rangée de nakazuri —
// c'est-à-dire tout ce qui s'éteint, et tout ce qui ne s'éteint pas.
await page.mouse.move(480, 270);
await page.mouse.down();
await page.mouse.move(480 - 30, 270 + 10, { steps: 3 });
await page.mouse.up();

/** Rapport de l'état continu : la coupure se lit autant en chiffres qu'à l'œil. */
async function probe() {
  return page.evaluate(() => {
    const r = window.__runtime;
    return {
      stage: r.emergencyStop.stage,
      kind: r.emergencyStop.kind,
      power: Number(r.carPower.toFixed(3)),
      speedKmh: Number((r.speed * 3.6).toFixed(1)),
      holdFor: Number(r.emergencyStop.holdFor.toFixed(0)),
      t: Number(r.emergencyStop.t.toFixed(1)),
    };
  });
}

/**
 * L'heure se repose juste avant chaque déclenchement : sous SwiftShader une
 * frame dure plusieurs secondes, et l'horloge du jeu court pendant ce temps-là.
 * Sans ça, la dernière prise se ferait au petit matin.
 */
async function shot(name) {
  await page.evaluate((c) => window.__probeClock(c), NIGHT);
  await new Promise((r) => setTimeout(r, 300));
  const state = await probe();
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('→', name, JSON.stringify(state));
}

// 22 h : la nuit est le moment où la coupure se voit le mieux — de jour, le
// soleil qui entre par les baies masque une bonne partie de ce qui s'éteint.
const NIGHT = 22 * 60;

await page.evaluate((c) => {
  window.__probeCruise(19);
  window.__probeClock(c);
}, NIGHT);
await new Promise((r) => setTimeout(r, 1500));
await shot('00-avant');

await page.evaluate(() => window.__powerOutage());
await new Promise((r) => setTimeout(r, 700));
await shot('01-coupure-elan');

await new Promise((r) => setTimeout(r, 4000));
await shot('02-freinage');

await page.waitForFunction(() => window.__runtime.emergencyStop.stage === 'stopped', {
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 1500));
await shot('03-immobilise');

// Saut jusqu'aux abords du retour de la tension, qui tombe 24 s avant le
// redémarrage. La marge est large : une frame SwiftShader dure plusieurs
// secondes, et la simulation les consomme — à six secondes près, la prise
// « attente » se ferait courant déjà revenu.
await page.evaluate(() => window.__outageSkip(-70));
await new Promise((r) => setTimeout(r, 1500));
await shot('04-attente-longue');

await page.evaluate(() => window.__outageSkip(-18));
await new Promise((r) => setTimeout(r, 2500));
await shot('05-courant-revenu');

await page.evaluate(() => window.__outageSkip(0));
await new Promise((r) => setTimeout(r, 2500));
await shot('06-reprise');

await browser.close();
await server.close();
