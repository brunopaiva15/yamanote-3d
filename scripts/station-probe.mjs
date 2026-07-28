// Sonde de gare, pilotée dans un vrai navigateur.
//
// Le contrôle géométrique « à la main » ne voit que ce qu'on a pensé à
// vérifier. Ici on démarre le jeu, on saute de gare en gare, et on interroge le
// GRAPHE DE SCÈNE tel qu'il est rendu : quels volumes s'interpénètrent, de
// combien, et où. Rien n'est re-déduit.
//
//   node scripts/station-probe.mjs            → les trente gares
//   node scripts/station-probe.mjs 16 19      → seulement celles-là
//   node scripts/station-probe.mjs --shot 19  → capture d'écran en plus

import { chromium } from 'playwright';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const shot = args.includes('--shot');
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
const phase = args.includes('--brake') ? 'brake' : 'dwell';
const stations = only.length ? only : [...Array(30).keys()];

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

// Démarrer : le menu attend un clic, et le rendu attend le premier arrêt.
// Le bouton « Monter à bord » : le plus grand de la page. Chercher « le
// premier bouton visible » tombait sur le sélecteur de langue.
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
  btns.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  btns[0]?.click();
});
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => typeof window.__stationProbe === 'function', { timeout: 20000 });
await page.evaluate((p) => { globalThis.__probePhase = p; }, phase);

// Paires dont l'interpénétration est VOULUE : une affiche est collée sur son
// caisson, un coffret vissé sur son poteau, un vantail coulisse dans son muret.
const IGNORE = [
  // Portes palières : le vitrage est encastré dans le muret, le bandeau le
  // couronne, les vantaux coulissent dedans.
  'gare/bandeau-psd ✕ gare/muret-psd',
  'gare/muret-psd ✕ gare/vitrage-psd',
  'gare/muret-psd ✕ gare/vantaux-psd',
  'gare/bandeau-psd ✕ gare/vantaux-psd',
  'gare/bandeau-psd ✕ gare/vitrage-psd',
  // Structure : la poutre repose sur le poteau, la bague le ceinture, la
  // trémie et l'escalier mécanique sont percés DANS la dalle.
  'gare/pilier ✕ gare/poutre',
  'gare/bague-pilier ✕ gare/pilier',
  'gare/dalle ✕ gare/trémie',
  'gare/dalle ✕ gare/escalator',
  'gare/dalle ✕ gare/ascenseur',
  // Trousse vissée sur son support : c'est le principe.
  'gare/pilier ✕ gare/trousse/extincteur',
  'gare/pilier ✕ gare/trousse/téléphone',
  'gare/pilier ✕ gare/trousse/descente-eau',
  'gare/bague-pilier ✕ gare/trousse/extincteur',
  'gare/bague-pilier ✕ gare/trousse/descente-eau',
  'gare/muret-psd ✕ gare/trousse/arrêt-urgence',
  'gare/bandeau-psd ✕ gare/trousse/arrêt-urgence',
  'gare/dalle ✕ gare/trousse/bac-tri',
  // Marquages peints : ils sont SUR la dalle, décalage de polygone à l'appui.
  'gare/dalle ✕ gare/trousse/ligne-guidage',
  'gare/dalle ✕ gare/trousse/repère-voiture',
  'gare/dalle ✕ gare/repères-attente',
  'gare/repères-attente ✕ gare/trousse/repère-voiture',
];

const totals = new Map();
for (const i of stations) {
  const res = await page.evaluate(
    async ([idx, ignore]) => {
      // Poser la gare voulue et laisser React la reconstruire.
      window.__probeGoto(idx, globalThis.__probePhase ?? 'dwell');
      await new Promise((r) => setTimeout(r, 350));
      return window.__stationProbe({ min: 0.05, ignore });
    },
    [i, IGNORE],
  );
  const name = await page.evaluate(() => window.__probeName());
  const worst = res.pairs.slice(0, 4).map((p) => `${p.a} ✕ ${p.b} (${p.worst.toFixed(2)} m ×${p.count})`);
  console.log(
    `${String(i + 1).padStart(2, '0')} ${name.padEnd(18)} ${String(res.volumes).padStart(5)} volumes  ${String(res.pairs.length).padStart(3)} paires`,
  );
  for (const w of worst) console.log(`      ${w}`);
  for (const p of res.pairs) {
    const k = `${p.a} ✕ ${p.b}`;
    const cur = totals.get(k) ?? { n: 0, worst: 0, stations: 0 };
    cur.n += p.count;
    cur.stations += 1;
    cur.worst = Math.max(cur.worst, p.worst);
    totals.set(k, cur);
  }
  if (shot) {
    // Laisser le rendu se stabiliser : textures de ville, foule, fondu.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
    await page.screenshot({ path: `/tmp/gare-${String(i + 1).padStart(2, '0')}.png` });
  }
}

console.log('\n══ Cumul sur les gares sondées ══');
for (const [k, v] of [...totals.entries()].sort((a, b) => b[1].worst - a[1].worst)) {
  console.log(`  ${v.worst.toFixed(2)} m  ×${String(v.n).padStart(5)}  ${String(v.stations).padStart(2)} gares  ${k}`);
}

await browser.close();
await server.close();
