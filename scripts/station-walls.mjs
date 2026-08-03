// LE TOUR DES PAROIS D'UN VOLUME, DE L'INTÉRIEUR.
//
//   node scripts/station-walls.mjs /tmp/parois 24 [medium]
//
// Les cinq vues de `station-views` sont posées sur le RÉSEAU : elles regardent
// ce que la gare dessert, et c'est ce qu'il faut pour juger qu'une gare est
// reconnaissable. Elles ne regardent jamais un mur. Or un volume se juge aussi
// à ce qui le FERME : un panneau manquant ne se voit que du dedans, en tournant
// le dos au trajet.
//
// On se pose donc au centre de chaque volume praticable et on regarde ses
// quatre faces, puis on se poste près de chacune et on regarde le long. Chaque
// vue rend aussi le NOM de ce qu'elle a au centre de l'image : un mur qui
// manque se lit dans le tableau avant de se voir sur l'image.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const TIERS = ['ultra', 'veryHigh', 'high', 'medium', 'low', 'veryLow'];
const tier = args.find((a) => TIERS.includes(a));
const out = args.find((a) => !/^\d+$/.test(a) && a !== tier) ?? '/tmp/parois';
const stations = args.filter((a) => /^\d+$/.test(a)).map(Number);
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5214 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5214/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent);
  b.sort((a, c) => c.offsetWidth * c.offsetHeight - a.offsetWidth * a.offsetHeight);
  b[0]?.click();
});
await page.waitForFunction(() => typeof window.__probeHalls === 'function', { timeout: 30000 });
if (tier) {
  await page.evaluate((q) => window.__probeQuality(q), tier);
  await new Promise((r) => setTimeout(r, 1500));
}
await page.addStyleTag({ content: '.app > :not(:first-child){display:none !important}' });

for (const i of stations) {
  await page.evaluate((n) => window.__probeGoto(n), i);
  await new Promise((r) => setTimeout(r, 1200));
  const name = await page.evaluate(() => window.__probeName());
  // Il faut être DANS le hall pour qu'il soit monté et que la marche y réponde.
  const { placement } = await page.evaluate(() => window.__probeInterior());
  const leg = placement.find((l) => l[0] === '02-zone-payante') ?? placement[1];
  if (leg) await page.evaluate(([x, z]) => window.__probeStand(x, z, 'concourse'), [leg[1], leg[2]]);
  await new Promise((r) => setTimeout(r, 700));
  const halls = await page.evaluate(() => window.__probeHalls());
  console.log(`\n══ ${name} — ${halls.length} pièces praticables ══`);
  for (const h of halls) {
    // Un mètre en retrait de chaque paroi, regard vers elle : c'est la seule
    // position d'où l'on voit qu'il manque un panneau.
    const cx = (h.x0 + h.x1) / 2;
    const cz = (h.z0 + h.z1) / 2;
    const posts = [
      ['x0', cx, cz, h.x0 - 20, cz],
      ['x1', cx, cz, h.x1 + 20, cz],
      ['z0', cx, cz, cx, h.z0 - 20],
      ['z1', cx, cz, cx, h.z1 + 20],
    ];
    for (const [face, sx, sz, tx, tz] of posts) {
      const go = await page.evaluate(([x, z]) => window.__probeStand(x, z, 'concourse'), [sx, sz]);
      await page.evaluate(([x, z]) => window.__lookAt(x, z), [tx, tz]);
      await new Promise((r) => setTimeout(r, 700));
      const hits = await page.evaluate(() => window.__probePick(0, 0));
      const first = hits[0];
      const tag = `${String(i + 1).padStart(2, '0')}-${name.replace(/[^\w-]/g, '')}-${h.id}-${face}`;
      await page.screenshot({ path: `${out}/${tag}${tier ? `-${tier}` : ''}.png` });
      console.log(
        `  ${h.id.padEnd(16)}${face}  sol ${Number.isFinite(go.y) ? 'oui' : 'NON'}  `
        + `→ ${first ? `${first.chain.replace('<Scene>/', '')} à ${first.d} m` : 'RIEN — on voit dehors'}`,
      );
    }
  }
}

await browser.close();
await server.close();
