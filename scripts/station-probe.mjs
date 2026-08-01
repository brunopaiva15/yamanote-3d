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
  // Une volée MONTANTE traverse la dalle du quai à son pied - elle y prend
  // appui - et l'auvent à mi-hauteur, par un percement. Ni l'un ni l'autre ne
  // se voit ici : la dalle et l'auvent sont chacun UN SEUL maillage extrudé, et
  // une boîte englobante ne sait pas exprimer un trou. Les deux paires sont
  // donc structurellement indétectables, pas tolérées par lassitude.
  'gare/dalle ✕ gare/volée-montante',
  'gare/auvent ✕ gare/volée-montante',
  // Un socle est un COLLIER : il enveloppe le pied du poteau, donc il le
  // traverse par construction. Le déclarer ici plutôt que de le rétrécir
  // jusqu'à ne plus rien envelopper.
  'gare/pilier ✕ gare/socle-pilier',
  // Portes palières : le vitrage est encastré dans le muret, le bandeau le
  // couronne, les vantaux coulissent dedans.
  'gare/bandeau-psd ✕ gare/muret-psd',
  'gare/muret-psd ✕ gare/vitrage-psd',
  'gare/muret-psd ✕ gare/vantaux-psd',
  'gare/bandeau-psd ✕ gare/vantaux-psd',
  'gare/bandeau-psd ✕ gare/vitrage-psd',
  // Le montant de rive est encastré dans le vantail qu'il borde, et coulisse
  // dans le muret avec lui.
  'gare/joint-vantaux-psd ✕ gare/vantaux-psd',
  'gare/joint-vantaux-psd ✕ gare/muret-psd',
  'gare/bandeau-psd ✕ gare/joint-vantaux-psd',
  'gare/joint-vantaux-psd ✕ gare/vitrage-psd',
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
  // Les bords d'en face reçoivent le même bandeau que le bord près : il
  // couronne leur muret, comme bandeau-psd ✕ muret-psd ci-dessus.
  'gare/bord-opposé ✕ gare/bord-opposé/bandeau-psd-opposé',
  'gare/travée-opposée ✕ gare/travée-opposée/bandeau-psd-opposé',
  // La gouttière court en tête de pilier, la potence de caméra est vissée
  // sous sa poutre : des attaches, pas des chocs.
  'gare/pilier ✕ gare/trousse/gouttière',
  'gare/poutre ✕ gare/trousse/caméra',
  // Harajuku : poutres en appui sur le mur de fond, caissons encastrés
  // dedans, armoires adossées contre.
  'gare/mur-fond ✕ gare/poutre',
  'gare/mur-fond ✕ gare/publicité/caisson-mur',
  'gare/mur-fond ✕ gare/trousse/armoire',
  // Charpentes signature : leurs poteaux et tabliers prennent appui DANS la
  // travée d'en face (piles, fondations) et traversent la dalle d'auvent -
  // c'est ainsi qu'un bâtiment enjambe un quai.
  'gare/charpente-ebisu ✕ gare/travée-opposée',
  'gare/charpente-nippori ✕ gare/travée-opposée',
  'gare/charpente-shimbashi ✕ gare/travée-opposée',
  'gare/charpente-takanawaGateway ✕ gare/travée-opposée',
  'gare/auvent ✕ gare/charpente-ebisu',
  'gare/auvent ✕ gare/charpente-shimbashi',
  'gare/auvent ✕ gare/charpente-takanawaGateway',
  // La gaine d'escalier mécanique monte PAR CONSTRUCTION jusqu'à la sous-face
  // de l'auvent ; et les balustrades inclinées gonflent leur boîte englobante
  // (la sonde travaille en AABB), d'où de faux contacts avec les néons.
  'gare/auvent ✕ gare/escalator',
  'gare/escalator ✕ gare/néon',
];

const totals = new Map();
for (const i of stations) {
  const res = await page.evaluate(
    async ([idx, ignore]) => {
      // Poser la gare voulue et laisser React la reconstruire. Le délai est
      // large à dessein : à 350 ms, sous SwiftShader, on mesurait parfois la
      // gare PRÉCÉDENTE encore montée, sous le nom de la nouvelle.
      window.__probeGoto(idx, globalThis.__probePhase ?? 'dwell');
      await new Promise((r) => setTimeout(r, 900));
      // Seuil à 5,5 cm : une pénétration de l'épaisseur exacte d'une suspente
      // (5 cm) est une tige qui prend appui sur une poutrelle - une attache,
      // pas un choc. Tout caisson fait au moins 7 cm : rien de réel n'échappe.
      return window.__stationProbe({ min: 0.055, ignore });
    },
    [i, IGNORE],
  );
  const name = await page.evaluate(() => window.__probeName());
  // Ce qui est DANS LE WAGON sans être de la rame. Le contrôle de volumes
  // ci-dessus ne regarde que sous `gare` : un décor de gare posé au mauvais
  // endroit ne s'y entrechoque avec rien, il se contente d'être debout au
  // milieu de l'allée. C'est arrivé - un cube d'un mètre à l'origine du repère
  // de gare, tous murets de portes palières empilés faute d'avoir été posés.
  const intruders = await page.evaluate(() => window.__probeIntruders());
  const worst = res.pairs.slice(0, 4).map((p) => `${p.a} ✕ ${p.b} (${p.worst.toFixed(2)} m ×${p.count})`);
  console.log(
    `${String(i + 1).padStart(2, '0')} ${name.padEnd(18)} ${String(res.volumes).padStart(5)} volumes  ${String(res.pairs.length).padStart(3)} paires`,
  );
  for (const w of worst) console.log(`      ${w}`);
  const seenIntruder = new Set();
  for (const h of intruders) {
    // La voûte de ciel englobe tout : elle n'entre nulle part.
    if (h.size[0] > 100) continue;
    const k = h.chain + JSON.stringify(h.size);
    if (seenIntruder.has(k)) continue;
    seenIntruder.add(k);
    console.log(`      ⚠ DANS LE WAGON  ${JSON.stringify(h.size)} en ${JSON.stringify(h.at)}  ${h.chain}`);
  }
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
