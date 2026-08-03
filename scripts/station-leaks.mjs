// PAR OÙ VOIT-ON DEHORS ? Les trente gares, sans regarder une seule image.
//
// ⚠ INSTRUMENT NON ÉTALONNÉ — NE PAS LIRE SES CHIFFRES COMME UN VERDICT.
//
// Il tourne, il discrimine (Okachimachi rend 1 %, Shinagawa 100 %), mais deux
// choses ne se recoupent pas encore et tant qu'elles ne se recoupent pas il ne
// prouve rien :
//
//   · la CHAÎNE DE NOMS des objets touchés revient anonyme
//     (`<Scene>/<Group>/<Mesh>`), alors que la sonde d'interpénétration
//     (`__stationProbe`) obtient bien `gare/gare/hall/…` sur la même scène. Tant
//     qu'on ne sait pas ce que le rayon touche, on ne sait pas ce qu'on mesure ;
//   · il annonce 100 % de fuites sur des vues dont la CAPTURE montre un volume
//     clos. L'un des deux se trompe, et ce n'est pas forcément la capture.
//
// La piste la plus probable est l'origine des rayons : `__probeStand` rend la
// cote de l'œil dans le repère MONDE, et rien ne garantit encore que le x et le
// z qu'on lui passe soient lus dans le même repère au moment du tir.
//
//   node scripts/station-leaks.mjs            → les trente
//   node scripts/station-leaks.mjs 24 27      → seulement celles-là
//
// Trois défauts de suite ont eu la même signature — un bout de hall sans
// paroi, un ouvrage qu'on foule sans le dessiner, un demi-niveau ouvert sur la
// rue — et trois fois il a fallu une capture pour les trouver. Une capture ne
// se lit pas cent cinquante fois de suite.
//
// On se pose donc aux mêmes cinq endroits que les captures (`__probeInterior`),
// et l'on tire sept cent vingt rayons vers le bas depuis l'œil. Dans un volume
// clos, tous rencontrent quelque chose. Ceux qui n'arrivent nulle part sont des
// TROUS, et leur part dit la gravité.

import { chromium } from 'playwright';
import { createServer } from 'vite';

const only = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const stations = only.length ? only : [...Array(30).keys()];

const server = await createServer({ server: { port: 5219 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5219/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent);
  b.sort((a, c) => c.offsetWidth * c.offsetHeight - a.offsetWidth * a.offsetHeight);
  b[0]?.click();
});
await page.waitForFunction(() => typeof window.__probeLeaks === 'function', { timeout: 30000 });

const rows = [];
for (const i of stations) {
  await page.evaluate((n) => window.__probeGoto(n), i);
  await new Promise((r) => setTimeout(r, 900));
  const name = await page.evaluate(() => window.__probeName());
  const legs = await page.evaluate(() => window.__probeInterior().placement);
  for (const [leg, fx, fz] of legs) {
    // La première vue est sur le QUAI : à ciel ouvert, tout fuit, et c'est
    // normal. On ne sonde que l'intérieur.
    if (leg.startsWith('01')) continue;
    const got = await page.evaluate(
      ([x, z]) => {
        const go = window.__probeStand(x, z, 'concourse');
        if (!Number.isFinite(go.y)) return null;
        // `__probeStand` rend déjà la cote de L'ŒIL, pas celle du sol : y
        // rajouter une taille d'homme plaçait l'origine des rayons au-dessus
        // du plafond, d'où quatre-vingts pour cent de « fuites » qui n'étaient
        // que le dehors vu depuis la dalle.
        return window.__probeLeaks(x, go.y, z);
      },
      [fx, fz],
    );
    if (!got) { rows.push({ i, name, leg, part: null }); continue; }
    rows.push({ i, name, leg, part: got.part, open: got.open, through: got.through });
  }
}

rows.sort((a, b) => (b.part ?? -1) - (a.part ?? -1));
console.log('\n══ CE QUI FUIT, du pire au meilleur ══\n');
console.log('  gare                      vue                 rayons perdus');
for (const r of rows) {
  if (r.part === null) {
    console.log(`  ${r.name.padEnd(24)} ${r.leg.padEnd(18)} pas de sol sous la vue`);
    continue;
  }
  if (r.part < 0.005) continue;
  console.log(
    `  ${r.name.padEnd(24)} ${r.leg.padEnd(18)}`
    + `${(r.part * 100).toFixed(1).padStart(6)} %  (${r.open}/720)`,
  );
  for (const [what, n] of r.through ?? []) console.log(`      ${String(n).padStart(4)}  ${what}`);
}
const clean = rows.filter((r) => r.part !== null && r.part < 0.005).length;
console.log(`\n  ${clean} vues sur ${rows.length} ne fuient pas du tout.\n`);

await browser.close();
await server.close();
