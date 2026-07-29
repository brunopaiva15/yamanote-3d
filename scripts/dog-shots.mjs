// Captures des CHIENS PROMENÉS sur le quai (systems/dogWalkers).
//
// La rencontre est rare par construction — une gare sur deux environ, quelque
// part sur 224 m de quai — donc on ne peut pas juger le rendu en jouant : on
// gèle la présence du quai, on attend qu'un maître passe, et on pose la caméra
// libre à côté du duo. C'est le moyen de vérifier un pack animalier fraîchement
// importé (taille de la race, pattes qui ne patinent pas, laisse accrochée à
// la bonne main).
//
//   node scripts/dog-shots.mjs [dossier] [nb d'images]
//
// Sans pack dans public/models/animals/, le script le dit et s'arrête : il n'y
// a alors aucun chien dans le jeu, ce qui est le comportement attendu.
//
// Le rendu passe par SwiftShader : une frame dure plusieurs secondes, et le
// cycle station file pendant les temps morts. La lecture chien + maître est
// donc SYNCHRONE — un `await` entre les deux laisse passer des images, et le
// maître peut avoir disparu dans l'escalier entre-temps.

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
// l'attente d'un chien durerait le tour de la boucle.
await page.evaluate(async () => {
  const rt = (await import('/src/systems/runtime.ts')).runtime;
  Object.defineProperty(rt, 'platformFade', { get: () => 1, set: () => {} });
  Object.defineProperty(rt, 'platformSlide', { get: () => 0, set: () => {} });
  const { DOOR_SIDE } = await import('/src/data/stations.ts');
  const store = (await import('/src/store.ts')).useStore;
  window.__dogProbe = { DOOR_SIDE, store };
});

// Le pack se charge de façon paresseuse (fetch du manifeste, puis GLB) : la
// liste des races n'existe qu'une fois three/PlatformDogs monté.
let breeds = 0;
for (let i = 0; i < 40 && breeds === 0; i++) {
  breeds = await page.evaluate(() => (window.__dogs ?? []).length);
  if (breeds === 0) await new Promise((r) => setTimeout(r, 500));
}
if (breeds === 0) {
  console.error("Aucune race installée : importer un pack avec `npm run animals:import`.");
  await browser.close();
  await server.close();
  process.exit(1);
}
console.log(`${breeds} race(s) installée(s) — en attente d'un promeneur…`);

let shots = 0;
for (let attempt = 0; attempt < 400 && shots < wanted; attempt++) {
  // Œil bas, côté mur : la laisse se lit contre le sol, et le chien n'est
  // jamais masqué par la rame.
  const close = shots % 2 === 1;
  const info = await page.evaluate(([dist, eye, look]) => {
    const { DOOR_SIDE, store } = window.__dogProbe;
    const dog = (window.__dogs ?? []).find((d) => d.owner >= 0);
    if (!dog) return null;
    const owner = window.__crowd?.[dog.owner];
    if (!owner) return null;
    const side = DOOR_SIDE[store.getState().platformIndex];
    const toWorld = (x, z) => (side === 1 ? { x, z } : { x: -x, z: -z });
    const a = toWorld(dog.pos.x, dog.pos.z);
    const b = toWorld(owner.pos.x, owner.pos.z);
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    window.__freeCam({ x: cx + dist * (side === 1 ? -1 : 1), y: eye, z: cz + dist * 0.8, tx: cx, ty: look, tz: cz });
    return {
      station: store.getState().platformIndex,
      gait: dog.gait,
      ownerState: owner.state,
      attend: +owner.holdWalk.toFixed(2),
      vitesse: +dog.speed.toFixed(2),
      main: dog.handSide === 1 ? 'droite' : 'gauche',
      ecart: +Math.hypot(dog.pos.x - owner.pos.x, dog.pos.z - owner.pos.z).toFixed(2),
      y: +dog.y.toFixed(2),
    };
  }, close ? [1.7, 0.8, 0.4] : [2.4, 1.0, 0.55]);
  if (!info) {
    await new Promise((r) => setTimeout(r, 400));
    continue;
  }
  await new Promise((r) => setTimeout(r, 800));
  const name = `chien-${String(shots).padStart(2, '0')}-${info.gait}`;
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('→', name, JSON.stringify(info));
  shots++;
  await new Promise((r) => setTimeout(r, 2500));
}
if (shots === 0) console.log('aucun chien croisé — le tirage est par gare, réessayer.');

await browser.close();
await server.close();
