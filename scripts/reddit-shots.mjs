// Quatre captures pour un post Reddit : quatre moments différents du jeu.
//
//   node scripts/reddit-shots.mjs /tmp/reddit
//
// Comme les autres sondes de capture (scenery-shots, pass-shots), le rendu passe
// par SwiftShader : une frame dure plusieurs secondes et le cycle station file
// pendant les temps morts. D'où la re-pose de l'état juste avant chaque déclenchement.
//
//   1. quai-attente  — debout sur le quai d'Ueno, on attend le prochain train
//   2. bord-jour     — assis dans le wagon, la ville de jour défile par la baie
//   3. bord-nuit     — le même wagon, la nuit, devant les néons de Shibuya
//   4. a-bord-nuit   — dans l'allée du wagon, la nuit, vers Shinjuku
//
// La scène du quai (1) est rendue EN DERNIER : y descendre bascule le référentiel
// du joueur sur le quai (playerFrame), ce qui perturberait les scènes de wagon.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/reddit';
mkdirSync(out, { recursive: true });

// Côté d'ouverture des portes par index (cf. data/stations.ts DOOR_SIDE) :
// worldX = quaiX * flip. On s'en sert pour poser la caméra libre sur le quai.
const DOOR_SIDE = [1, -1, 1, 1, -1, 1, -1, 1, 1, -1, 1, 1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1, -1, 1, 1, -1, 1, -1, 1, -1];

const server = await createServer({ root: process.cwd(), server: { port: 5207 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('  ⚠ console :', m.text()); });

await page.goto('http://localhost:5207/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  try { localStorage.setItem('yamanote.quality', 'high'); } catch { /* mode privé */ }
});
await page.reload({ waitUntil: 'networkidle' });
// Clic sur le plus grand bouton visible : « Monter à bord ».
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
  btns.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  btns[0]?.click();
});
await page.waitForFunction(() => typeof window.__probeCruise === 'function', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
// HUD masqué : captures « propres » (le canvas est le premier enfant de .app).
await page.addStyleTag({ content: '.app > :not(:first-child){display:none !important}' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pose de caméra libre en repère QUAI (x vers le fond du quai, z le long de la
// voie), convertie en monde par le côté d'ouverture : worldX = x*flip, worldZ = z*flip.
function platformPose(i, e, t) {
  const f = DOOR_SIDE[i];
  return { x: e[0] * f, y: e[1], z: e[2] * f, tx: t[0] * f, ty: t[1], tz: t[2] * f };
}

// Ciel dégagé forcé : sans lui, un épisode de crachin tiré au hasard couvre le
// quai de traînées de pluie.
const CLEAR = { kind: 'clear', rain: 0, cloud: 0.2, wet: 0, tempC: 17, visibility: 1 };

// ---------------------------------------------------------------------------
// 2. Assis à bord, ville de jour — viaduc, arrivée sur Nishi-Nippori (index 7)
// ---------------------------------------------------------------------------
{
  await page.evaluate(() => {
    window.__probeCruise(7, 8);
    window.__probeDate(5, 18);       // mi-mai : feuillage plein, soleil haut
    window.__probeClock(11 * 60 + 30);
    window.__freeCam({ x: 0.98, y: 1.22, z: -6.4, tx: -0.55, ty: 1.02, tz: 7.5 });
  });
  await sleep(2000);
  await page.screenshot({ path: `${out}/2-bord-jour.png` });
  console.log('→ 2-bord-jour');
}

// ---------------------------------------------------------------------------
// 3. À bord la nuit, néons — arrivée sur Shibuya (index 19)
// ---------------------------------------------------------------------------
{
  await page.evaluate(() => {
    window.__probeCruise(19, 8);
    window.__probeDate(11, 20);
    window.__probeClock(19 * 60 + 40);
    window.__freeCam({ x: 0.15, y: 1.16, z: -2.2, tx: 5.5, ty: 0.95, tz: 6.5 });
  });
  await sleep(2000);
  await page.screenshot({ path: `${out}/3-bord-nuit.png` });
  console.log('→ 3-bord-nuit');
}

// ---------------------------------------------------------------------------
// 4. À bord la nuit, dans l'allée — arrivée sur Shinjuku (index 17), 21 h 30
// ---------------------------------------------------------------------------
{
  await page.evaluate((w) => {
    window.__probeCruise(17, 8);
    window.__probeDate(11, 20);
    window.__probeClock(21 * 60 + 30);
    window.__probeWeather(w);
    window.__freeCam({ x: 0.35, y: 1.42, z: -8.3, tx: -0.1, ty: 1.12, tz: 9 });
  }, CLEAR);
  await sleep(2200);
  await page.screenshot({ path: `${out}/4-a-bord-nuit.png` });
  console.log('→ 4-a-bord-nuit');
}

// ---------------------------------------------------------------------------
// 1. Sur le quai, en attente — Ueno (index 4, halle rivetée). EN DERNIER : y
//    descendre bascule le référentiel du joueur sur le quai.
// ---------------------------------------------------------------------------
{
  const i = 4;
  await page.evaluate((k) => {
    window.__freeCam(null);
    window.__probeGoto(k, 'dwell');
    window.__runtime.phaseT = 6;      // milieu de l'arrêt : portes ouvertes
  }, i);
  // Franchir le seuil ouvert : on ré-essaie jusqu'à ce que les portes soient
  // réellement ouvertes (sous SwiftShader, l'ouverture prend un nombre de frames
  // variable). Le joueur passe alors sur le quai et le train repart sans lui.
  let crossed = false;
  for (let k = 0; k < 25 && !crossed; k++) {
    await sleep(700);
    crossed = await page.evaluate(() => window.__crossPortal());
  }
  if (!crossed) console.error('  ⚠ franchissement du seuil refusé (portes fermées ?)');
  await page.evaluate(() => window.__platformWaitSpeed(14));
  await page.waitForFunction(() => window.__platformWait.stage === 'clear', { timeout: 60000 });
  // Laisser le quai se repeupler par les escaliers, puis figer l'attente.
  await page.evaluate(() => window.__platformWaitSpeed(3));
  await page.waitForFunction(() => window.__platformWait.t >= 42, { timeout: 60000 });
  await page.evaluate(() => window.__platformWaitSpeed(0.02));
  const pose = platformPose(i, [3.7, 1.55, -9], [1.95, 1.35, 11]);
  await page.evaluate(([c, w]) => {
    window.__freeCam(c);
    window.__probeDate(10, 25);       // fin octobre
    window.__probeClock(15 * 60 + 40);
    window.__probeWeather(w);
  }, [pose, CLEAR]);
  await sleep(2200);
  await page.screenshot({ path: `${out}/1-quai-attente.png` });
  console.log('→ 1-quai-attente (Ueno)');
}

await browser.close();
await server.close();
console.log('Terminé :', out);
