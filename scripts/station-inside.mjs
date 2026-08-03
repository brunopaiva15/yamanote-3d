// CE QUI ENTRE DANS UN HALL SANS Y AVOIR ÉTÉ INVITÉ.
//
//   node scripts/station-inside.mjs            → les trente gares
//   node scripts/station-inside.mjs 4 24 25    → seulement celles-là
//
// Un volume praticable a un sol, quatre parois et un plafond ; ce qui traverse
// cette boîte sans appartenir au hall est un défaut, qu'il soit d'un centimètre
// ou d'un mètre. La question se pose depuis que treize gares portent un plateau
// au-dessus des voies : le quai avait déjà des ouvrages à cette hauteur-là.
//
// La boîte est celle du RÉSEAU, en repère monde, et la réponse vient de la
// scène telle qu'elle est rendue (`__probeIn`) — pas d'une cote re-déduite.

import { chromium } from 'playwright';
import { createServer } from 'vite';

const only = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const stations = only.length ? only : [...Array(30).keys()];

const server = await createServer({ root: process.cwd(), server: { port: 5212 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5212/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent);
  b.sort((a, c) => c.offsetWidth * c.offsetHeight - a.offsetWidth * a.offsetHeight);
  b[0]?.click();
});
await page.waitForFunction(() => typeof window.__probeIn === 'function', { timeout: 30000 });

let total = 0;
for (const i of stations) {
  await page.evaluate((n) => window.__probeGoto(n), i);
  // Il faut être DANS la gare pour que le hall soit monté : la sonde se pose au
  // point de vue de la zone payante, comme les captures.
  const { placement } = await page.evaluate(() => window.__probeInterior());
  const leg = placement.find((l) => l[0] === '02-zone-payante') ?? placement[1];
  if (leg) {
    await page.evaluate(([x, z]) => window.__probeStand(x, z, 'concourse'), [leg[1], leg[2]]);
  }
  await new Promise((r) => setTimeout(r, 900));
  const name = await page.evaluate(() => window.__probeName());
  const shells = await page.evaluate(() => window.__probeHalls());
  const lines = [];
  for (const s of shells) {
    // Deux centimètres à l'intérieur : un sol et un plafond TOUCHENT leur
    // volume par construction, et ce n'est pas ce qu'on cherche.
    const hits = await page.evaluate(
      ([a, b]) => window.__probeIn(a, b),
      [[s.x0 + 0.02, s.floorY + 0.02, s.z0 + 0.02], [s.x1 - 0.02, s.ceilY - 0.02, s.z1 - 0.02]],
    );
    for (const h of hits) lines.push(h);
  }
  if (!lines.length) continue;
  total += lines.length;
  console.log(`\n${String(i).padStart(2)} ${name}`);
  for (const h of lines.slice(0, 12)) {
    console.log(`   ${String(h.over.toFixed(2)).padStart(6)} m  ${h.chain}  ${JSON.stringify(h.box)}`);
  }
  if (lines.length > 12) console.log(`   … et ${lines.length - 12} autres`);
}

console.log(`\n══ ${total} ouvrages entrent dans un hall ══`);
await browser.close();
await server.close();
