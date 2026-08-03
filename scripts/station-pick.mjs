// CE QU'ON VOIT, NOMMÉ.
//
//   node scripts/station-pick.mjs 4              → la gare 4, vue « zone payante »
//   node scripts/station-pick.mjs 4 02-zone-payante /tmp/pick
//
// La capture montre un bloc gris ; elle ne dit pas de quel fichier il sort.
// On se pose donc au point de vue de `__probeInterior` — le même que les
// captures — et on interroge une grille de pixels avec `__probePick`. Chaque
// case rend le nom complet de ce qu'elle touche, sa distance et sa couleur.
//
// L'image est enregistrée à côté, avec la grille en surimpression, pour qu'on
// puisse relier une case du tableau à un endroit de la vue.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const station = Number(args[0] ?? 4);
const legWanted = args.find((a) => /^\d\d-/.test(a)) ?? '02-zone-payante';
const out = args.find((a) => a.startsWith('/')) ?? '/tmp/pick';
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5209 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5209/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent);
  b.sort((a, c) => c.offsetWidth * c.offsetHeight - a.offsetWidth * a.offsetHeight);
  b[0]?.click();
});
await page.waitForFunction(() => typeof window.__probePick === 'function', { timeout: 30000 });
await page.addStyleTag({ content: '.app > :not(:first-child){display:none !important}' });

await page.evaluate((n) => window.__probeGoto(n), station);
await new Promise((r) => setTimeout(r, 1000));
const name = await page.evaluate(() => window.__probeName());
const { placement } = await page.evaluate(() => window.__probeInterior());
const leg = placement.find((l) => l[0] === legWanted) ?? placement[1] ?? placement[0];
if (!leg) {
  console.log('aucun point de vue');
  await browser.close();
  await server.close();
  process.exit(1);
}
const [tag, fx, fz, tx, tz] = leg;
const level = tag.startsWith('01') ? 'platform' : 'concourse';
const go = await page.evaluate(([x, z, l]) => window.__probeStand(x, z, l), [fx, fz, level]);
await page.evaluate(([x, z]) => window.__lookAt(x, z), [tx, tz]);
await new Promise((r) => setTimeout(r, 1400));
await page.screenshot({ path: `${out}/${station}-${name}-${tag}.png` });

console.log(`\n══ ${name} — ${tag} — œil ${go.x ?? fx}, ${go.y}, ${go.z ?? fz} ══\n`);
// Cinq colonnes, cinq lignes : assez pour situer une bande sans noyer la sortie.
const XS = [-0.7, -0.35, 0, 0.35, 0.7];
const YS = [0.6, 0.3, 0, -0.3, -0.6];
for (const y of YS) {
  const row = [];
  for (const x of XS) {
    const hits = await page.evaluate(([a, b]) => window.__probePick(a, b), [x, y]);
    const h = hits[0];
    row.push(h ? `${h.chain.replace(/^<Scene>\//, '')}|${h.color ?? '—'}|${h.d}` : '(rien)');
  }
  console.log(`  y=${String(y).padStart(4)}`);
  XS.forEach((x, k) => console.log(`     x=${String(x).padStart(5)}  ${row[k]}`));
}

await browser.close();
await server.close();
