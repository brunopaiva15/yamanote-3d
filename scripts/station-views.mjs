// LES CINQ VUES DE CHAQUE GARE : quai, zone payante, portillon, zone libre,
// bouches de sortie.
//
// La sonde d'interpénétration (`scripts/station-probe.mjs`) dit si deux volumes
// se traversent. Elle ne dit pas si la gare RESSEMBLE à quelque chose, et c'est
// pourtant tout le sujet du chantier : trente gares reconnaissables. Ce script
// pose donc le joueur aux cinq endroits qui font une gare et déclenche.
//
//   node scripts/station-views.mjs /tmp/vues          → les trente gares
//   node scripts/station-views.mjs /tmp/vues 0 16 19  → seulement celles-là
//
// LES POINTS DE VUE NE SONT PAS ÉCRITS ICI. Ils viennent de `__probeInterior`,
// qui les lit sur le RÉSEAU de la gare — vingt-six gares passent par leur
// relevé, leur contrôle ne se franchit pas toujours selon z, et leur zone libre
// n'est pas « plus loin ». Un cadrage écrit à la main photographierait un hall
// qui n'est plus là.
//
// ET L'ON Y VA À PIED. `__probeGo` marche réellement, collisions comprises :
// une vue qu'on n'atteint pas est une gare où l'on ne peut pas aller, et le
// script le dit au lieu de téléporter la caméra par-dessus une vitrine.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

// Le PALIER se donne comme les autres arguments : `ultra`, `medium`, `low`,
// `veryLow`. Sans lui, la gare se montre telle que le sélecteur l'a laissée —
// c'est-à-dire au palier le plus riche. Les défauts ne sont pas les mêmes d'un
// palier à l'autre : à « moyenne », le mobilier du hall n'est plus qu'un
// volume, et un volume mal posé se voit là où sa décoration le cachait.
const args = process.argv.slice(2);
const TIERS = ['ultra', 'veryHigh', 'high', 'medium', 'low', 'veryLow'];
const tier = args.find((a) => TIERS.includes(a));
const out = args.find((a) => !/^\d+$/.test(a) && a !== tier) ?? '/tmp/vues';
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
const stations = only.length ? only : [...Array(30).keys()];
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5204 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5204/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
  btns.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  btns[0]?.click();
});
await page.waitForFunction(() => typeof window.__probeQuality === 'function', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
// L'interface par-dessus le rendu n'apprend rien sur la gare.
if (tier) {
  await page.evaluate((q) => window.__probeQuality(q), tier);
  await new Promise((r) => setTimeout(r, 1500));
}
await page.addStyleTag({ content: '.app > :not(:first-child){display:none !important}' });

let missed = 0;
for (const i of stations) {
  await page.evaluate((n) => window.__probeGoto(n), i);
  await new Promise((r) => setTimeout(r, 900));
  const name = await page.evaluate(() => window.__probeName());
  const { placement } = await page.evaluate(() => window.__probeInterior());
  const tag = `${String(i + 1).padStart(2, '0')}-${name.replace(/[^\w-]/g, '')}`;
  console.log(`${tag} — ${placement.length} vues`);
  for (const [leg, fx, fz, tx, tz] of placement) {
    // ON SE POSE, ON NE MARCHE PAS. Une capture montre ce qu'on VOIT ; ce
    // qu'on peut ATTEINDRE est prouvé ailleurs, par des itinéraires réellement
    // parcourus au pas de huit centimètres (`tests/stationInside`). Faire
    // sortir le joueur du wagon et lui faire descendre l'escalier pour chacune
    // des cent cinquante vues coûterait une heure sans rien prouver de plus.
    // La première vue est sur le QUAI (le nez de la trémie) ; les quatre
    // autres sont dans le hall, et l'étage se dit — voir `__probeStand`.
    const level = leg.startsWith('01') ? 'platform' : 'concourse';
    const go = await page.evaluate(
      ([x, z, l]) => window.__probeStand(x, z, l),
      [fx, fz, level],
    );
    await page.evaluate(([x, z]) => window.__lookAt(x, z), [tx, tz]);
    // Le sol sous les pieds : une vue posée dans le vide se voit tout de suite
    // sur l'image, mais elle se DIT ici, ce qui évite d'avoir à les regarder
    // toutes pour trouver la seule qui flotte.
    if (!Number.isFinite(go.y)) {
      missed++;
      console.log(`      ⚠ ${leg} : aucun sol sous le point de vue`);
    }
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `${out}/${tag}-${leg}${tier ? `-${tier}` : ''}.png` });
  }
}

console.log(`\n══ ${stations.length} gares, ${missed} vues inatteignables ══`);
await browser.close();
await server.close();
