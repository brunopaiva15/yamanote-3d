// DEUX SURFACES DANS LE MÊME PLAN, GARE PAR GARE — le z-fighting.
//
//   node scripts/station-flat.mjs            → les trente gares
//   node scripts/station-flat.mjs 24 25      → seulement celles-là
//
// Une bande grise qui clignote sur une paroi ne se cherche pas à l'œil : le
// scintillement dépend de l'angle, de la distance et de la précision du tampon
// de profondeur, si bien qu'une capture peut ne rien montrer là où le défaut
// est. Il se CALCULE : deux faces plates à la même cote, qui se recouvrent sur
// une grande surface, se disputeront le pixel quoi qu'il arrive.
//
// La sonde se pose DANS le hall, comme `station-inside` : c'est là que les
// parois sont montées.

import { chromium } from 'playwright';
import { createServer } from 'vite';

const only = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const stations = only.length ? only : [...Array(30).keys()];

const server = await createServer({ root: process.cwd(), server: { port: 5215 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5215/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent);
  b.sort((a, c) => c.offsetWidth * c.offsetHeight - a.offsetWidth * a.offsetHeight);
  b[0]?.click();
});
await page.waitForFunction(() => typeof window.__probeFlat === 'function', { timeout: 30000 });

let total = 0;
for (const i of stations) {
  await page.evaluate((n) => window.__probeGoto(n), i);
  const { placement } = await page.evaluate(() => window.__probeInterior());
  const leg = placement.find((l) => l[0] === '02-zone-payante') ?? placement[1];
  if (leg) {
    await page.evaluate(([x, z]) => window.__probeStand(x, z, 'concourse'), [leg[1], leg[2]]);
  }
  await new Promise((r) => setTimeout(r, 900));
  const name = await page.evaluate(() => window.__probeName());
  const hits = await page.evaluate(() => window.__probeFlat());
  if (!hits.length) continue;
  total += hits.length;
  console.log(`\n${String(i).padStart(2)} ${name}`);
  for (const h of hits.slice(0, 10)) {
    console.log(`   ${String(h.area.toFixed(2)).padStart(7)} m²  ${h.axis} = ${h.at}  (écart ${h.gap} m)`);
    console.log(`            ${h.pair}`);
  }
  if (hits.length > 10) console.log(`   … et ${hits.length - 10} autres`);
}

console.log(`\n══ ${total} paires de surfaces coplanaires ══`);
await browser.close();
await server.close();
