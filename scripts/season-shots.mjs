// Captures du décor extérieur AU FIL DE L'ANNÉE, vues depuis le wagon.
//
// Même dispositif que scripts/scenery-shots.mjs — on se cale au milieu d'un
// inter-gare, on vise par une baie — mais ce qu'on fait varier n'est plus
// l'heure, c'est la DATE. On cherche à répondre à une seule question : depuis
// une place assise, sait-on en quel mois on est ?
//
//   node scripts/season-shots.mjs /tmp/saisons
//
// Le rendu passe par SwiftShader : une frame dure plusieurs secondes, et le
// cycle station file pendant les temps morts. D'où la re-pose de l'état juste
// avant chaque déclenchement.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/saisons';
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5204 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  ⚠ console :', m.text()); });
await page.goto('http://localhost:5204/', { waitUntil: 'networkidle' });

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

async function aim(dx, dy) {
  await page.mouse.move(480, 270);
  await page.mouse.down();
  await page.mouse.move(480 + dx, 270 + dy, { steps: 3 });
  await page.mouse.up();
}
// De travers, plongée douce : l'angle où l'on voit à la fois le bord de voie et
// la ville — les deux endroits où la saison s'écrit. À l'horizontale on ne
// verrait que des façades, qui ne changent pas d'un mois à l'autre.
await aim(-230, 15);

// Harajuku → Shibuya (index d'ARRIVÉE 19) : au niveau du sol, `greenery`, et le
// bois du Meiji-jingū en repère. C'est le tronçon le plus végétal de la boucle,
// donc celui où la saison se juge.
const STATION = 19;
// 12 h 30 : le soleil est à sa hauteur méridienne, celle qui change le plus
// d'un solstice à l'autre (31° en décembre, 78° en juin).
const NOON = 12 * 60 + 30;

const dates = [
  [1, 15, 'janvier-ramure-nue'],
  [3, 30, 'fin-mars-sakura'],
  [5, 10, 'mai-jeunes-feuilles'],
  [6, 25, 'juin-tsuyu'],
  [8, 15, 'aout-canicule'],
  [11, 28, 'fin-novembre-koyo'],
];

/**
 * Même abscisse pour toutes les prises.
 *
 * Sans elle, chaque capture voit d'autres cellules de ville — le cycle file
 * pendant les temps morts de SwiftShader — et on compare deux quartiers au
 * lieu de comparer deux saisons. Repose juste avant le déclenchement, pour la
 * même raison.
 */
const DIST = 640;

/**
 * Beau fixe, sur toutes les prises.
 *
 * La météo est semée par la date : changer de mois change le temps qu'il fait,
 * et une averse de janvier vient masquer précisément ce qu'on est venu
 * regarder. Ici on isole la SAISON ; le temps qu'il fait a sa propre sonde
 * (scripts/weather-shots.mjs).
 */
const CLEAR = { cloud: 0.05, rain: 0, snow: 0, wet: 0, snowCover: 0, visibility: 1 };

for (const [month, day, name] of dates) {
  await page.evaluate(([i, c, m, d, dist, clear]) => {
    window.__probeCruise(i);
    window.__probeClock(c);
    window.__probeDate(m, d);
    window.__probeDistance(dist);
    window.__probeWeather(clear);
  }, [STATION, NOON, month, day, DIST, CLEAR]);
  await new Promise((r) => setTimeout(r, 1600));
  await page.evaluate(([c, dist, clear]) => {
    window.__probeClock(c);
    window.__probeDistance(dist);
    window.__probeWeather(clear);
  }, [NOON, DIST, CLEAR]);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('→', name);
}

// La tombée de la nuit, aux deux solstices, à la même heure de l'horloge :
// 17 h 15. En décembre il fait nuit, en juin il fait grand jour — et c'est
// sans doute la différence la plus violente de toute l'année.
for (const [month, day, name] of [[12, 21, 'solstice-hiver-1715'], [6, 21, 'solstice-ete-1715']]) {
  await page.evaluate(([i, m, d, dist, clear]) => {
    window.__probeCruise(i);
    window.__probeClock(17 * 60 + 15);
    window.__probeDate(m, d);
    window.__probeDistance(dist);
    window.__probeWeather(clear);
  }, [STATION, month, day, DIST, CLEAR]);
  await new Promise((r) => setTimeout(r, 1600));
  await page.evaluate(([dist, clear]) => {
    window.__probeClock(17 * 60 + 15);
    window.__probeDistance(dist);
    window.__probeWeather(clear);
  }, [DIST, CLEAR]);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('→', name);
}

await browser.close();
await server.close();
