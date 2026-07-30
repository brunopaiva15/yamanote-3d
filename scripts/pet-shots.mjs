// Captures des CHIENS EN CAISSE DE TRANSPORT sur le quai (systems/petCarriers).
//
// La rencontre est rare par construction - une gare sur quatre environ, quelque
// part sur 224 m de quai - donc on ne peut pas juger le rendu en jouant : on
// gèle la présence du quai, on attend qu'un porteur passe, et on pose la caméra
// libre à côté de lui. C'est le moyen de vérifier un pack animalier fraîchement
// importé : la bête tient-elle dans la caisse, la voit-on par les barreaux, la
// poignée arrive-t-elle bien à la main.
//
//   node scripts/pet-shots.mjs [dossier] [nb d'images]
//
// Sans pack dans public/models/animals/, le script le dit et s'arrête : il n'y
// a alors aucun chien dans le jeu, ce qui est le comportement attendu.
//
// Le rendu passe par SwiftShader : une frame dure plusieurs secondes, et le
// cycle station file pendant les temps morts. La lecture caisse + porteur est
// donc SYNCHRONE - un `await` entre les deux laisse passer des images, et le
// porteur peut être monté en rame entre-temps.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/chiens';
const wanted = Number(process.argv[3] ?? 6);
mkdirSync(out, { recursive: true });

const server = await createServer({ root: process.cwd(), server: { port: 5212 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 660 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5212/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
  btns.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  btns[0]?.click();
});
await new Promise((r) => setTimeout(r, 3500));

// Le quai reste présent : sans ça, la foule est effacée entre deux gares et
// l'attente d'un porteur durerait le tour de la boucle.
await page.evaluate(async () => {
  const rt = (await import('/src/systems/runtime.ts')).runtime;
  Object.defineProperty(rt, 'platformFade', { get: () => 1, set: () => {} });
  Object.defineProperty(rt, 'platformSlide', { get: () => 0, set: () => {} });
  const { DOOR_SIDE } = await import('/src/data/stations.ts');
  const store = (await import('/src/store.ts')).useStore;
  window.__petProbe = { DOOR_SIDE, store };
});

// Le pack se charge de façon paresseuse (fetch du manifeste, puis GLB) : la
// liste des races n'existe qu'une fois three/PlatformPets monté.
let breeds = 0;
for (let i = 0; i < 40 && breeds === 0; i++) {
  breeds = await page.evaluate(() => (window.__pets ?? []).length);
  if (breeds === 0) await new Promise((r) => setTimeout(r, 500));
}
if (breeds === 0) {
  console.error('Aucune race installée : importer un pack avec `npm run animals:import`.');
  await browser.close();
  await server.close();
  process.exit(1);
}
console.log(`${breeds} race(s) installée(s) - en attente d'un porteur…`);

let shots = 0;
for (let attempt = 0; attempt < 400 && shots < wanted; attempt++) {
  // Œil bas, à hauteur de la caisse : c'est elle qu'on vient regarder, et de
  // près - les barreaux et ce qu'il y a derrière ne se lisent pas de loin.
  const close = shots % 2 === 1;
  const info = await page.evaluate(([dist, eye, look]) => {
    const { DOOR_SIDE, store } = window.__petProbe;
    const c = (window.__pets ?? []).find((p) => p.owner >= 0 && p.handSet);
    if (!c) return null;
    const owner = window.__crowd?.[c.owner];
    if (!owner) return null;
    const side = DOOR_SIDE[store.getState().platformIndex];
    // Le repère du quai a la voie du côté des x DÉCROISSANTS et le mur de
    // fond du côté des x croissants, quelle que soit la gare : on y place
    // l'œil, PUIS on convertit. L'œil reste SUR le quai, en retrait du nez de
    // quai (x = 1,78) - sinon on le plante dans la caisse de la rame.
    const toWorld = (x, z) => (side === 1 ? { x, z } : { x: -x, z: -z });
    const target = toWorld(owner.pos.x, owner.pos.z);
    const eyePos = toWorld(Math.min(owner.pos.x - 0.8, 2.6), owner.pos.z + dist);
    window.__freeCam({ x: eyePos.x, y: eye, z: eyePos.z, tx: target.x, ty: look, tz: target.z });
    return {
      station: store.getState().platformIndex,
      porteur: owner.id,
      etat: owner.state,
      main: c.handSide === 1 ? 'droite' : 'gauche',
      action: owner.action,
    };
  }, close ? [1.5, 0.62, 0.5] : [2.3, 1.05, 0.62]);
  if (!info) {
    await new Promise((r) => setTimeout(r, 400));
    continue;
  }
  await new Promise((r) => setTimeout(r, 800));
  const name = `caisse-${String(shots).padStart(2, '0')}-${info.etat}`;
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('→', name, JSON.stringify(info));
  shots++;
  await new Promise((r) => setTimeout(r, 2500));
}
if (shots === 0) console.log('aucun porteur croisé - le tirage est par gare, réessayer.');

await browser.close();
await server.close();
