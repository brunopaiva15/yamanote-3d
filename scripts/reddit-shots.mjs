// Quatre captures pour un post Reddit : quatre moments différents du jeu.
//
//   node scripts/reddit-shots.mjs /tmp/reddit
//
// Comme les autres sondes de capture (scenery-shots, pass-shots), le rendu passe
// par SwiftShader : une frame dure plusieurs secondes et le cycle station file
// pendant les temps morts. D'où la re-pose de l'état juste avant chaque déclenchement.
//
//   1. quai-attente  — debout sur le quai, on attend le prochain train (heure dorée)
//   2. bord-jour     — assis dans le wagon, la ville de jour défile par la baie
//   3. bord-nuit     — le même wagon, la nuit, devant les néons de Shibuya
//   4. express       — le rapide Keihin-Tōhoku qui traverse la voie d'en face

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

// ---------------------------------------------------------------------------
// 1. Sur le quai, en attente — Takanawa Gateway (26e gare, index 25), heure dorée
// ---------------------------------------------------------------------------
{
  const i = 25;
  await page.evaluate((k) => {
    window.__probeGoto(k, 'dwell');
  }, i);
  await sleep(1200);
  await page.evaluate(() => {
    window.__probeDate(11, 12);      // mi-novembre : nuit qui tombe tôt, lumière rasante
    window.__probeClock(16 * 60 + 20);
    window.__alight();               // on descend : le train partira sans nous
    window.__platformWaitSpeed(14);  // on accélère jusqu'au quai vide
  });
  // Attendre que la rame soit partie et que le creux d'attente commence.
  await page.waitForFunction(() => window.__platformWait.stage === 'clear', { timeout: 60000 });
  // Laisser le quai se repeupler par les escaliers, puis figer.
  await page.evaluate(() => window.__platformWaitSpeed(3));
  await page.waitForFunction(() => window.__platformWait.t >= 40, { timeout: 60000 });
  await page.evaluate(() => window.__platformWaitSpeed(0.02));
  const pose = platformPose(i, [3.7, 1.55, -9], [1.95, 1.35, 11]);
  await page.evaluate(([c, clk]) => {
    window.__freeCam(c);
    window.__probeClock(clk);
  }, [pose, 16 * 60 + 20]);
  await sleep(1800);
  await page.screenshot({ path: `${out}/1-quai-attente.png` });
  console.log('→ 1-quai-attente');
  await page.evaluate(() => { window.__freeCam(null); window.__board(); });
}

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
  await sleep(1800);
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
  await sleep(1800);
  await page.screenshot({ path: `${out}/3-bord-nuit.png` });
  console.log('→ 3-bord-nuit');
}

// ---------------------------------------------------------------------------
// 4. L'express Keihin-Tōhoku qui passe — Okachimachi (index 3), midi
// ---------------------------------------------------------------------------
{
  const i = 3;
  await page.evaluate((k) => {
    window.__freeCam(null);
    window.__probeGoto(k, 'dwell');
    window.__passRate(0);
    window.__passAt(0);
  }, i);
  await sleep(1600);
  const s = await page.evaluate(() => {
    const r = window.__passConsist;
    r.updateWorldMatrix(true, true);
    return r.getWorldPosition(new r.position.constructor()).x < 0 ? -1 : 1;
  });
  const cam = [7.6, 1.6, 8];
  const target = [9.9, 1.4, -30];
  const nose = -60;
  for (let k = 0; k < 2; k++) {
    await page.evaluate(
      ([idx, c, tg, z]) => {
        window.__freeCam({ x: c[0], y: c[1], z: c[2], tx: tg[0], ty: tg[1], tz: tg[2] });
        window.__probeGoto(idx, 'dwell');
        window.__runtime.phaseT = 6;
        window.__probeClock(12 * 60);
        window.__passRate(0);
        window.__passAt(z);
      },
      [i, [s * cam[0], cam[1], s * cam[2]], [s * target[0], target[1], s * target[2]], nose],
    );
    await sleep(1600);
  }
  await page.screenshot({ path: `${out}/4-express.png` });
  console.log('→ 4-express');
}

await browser.close();
await server.close();
console.log('Terminé :', out);
