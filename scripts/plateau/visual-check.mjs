// Vérification visuelle et technique du monde PLATEAU dans le navigateur.
//
//   node scripts/plateau/visual-check.mjs [dossier-de-sortie]
//
// Lance Vite, ouvre le jeu sous Chromium, embarque, se pose sur le tronçon du
// prototype (lu dans config.mjs) et contrôle, à plusieurs abscisses :
//   · aucune erreur de page ni de console ;
//   · le monde géoréférencé est bien monté et visible ;
//   · la fenêtre de chunks reste bornée ;
//   · l'abscisse avance et le décor tourne dans la courbe (le cap change) ;
//   · aucun bâtiment ne traverse l'emprise du wagon ;
//   · avec ?plateau=0, plus rien de PLATEAU n'est monté et le décor
//     procédural reprend la main.
//
// Le rendu passe par SwiftShader : une frame dure plusieurs secondes. On
// repose donc l'état juste avant chaque capture, comme scripts/scenery-shots.mjs.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLATEAU_CONFIG } from './config.mjs';

const PROTO = PLATEAU_CONFIG.prototype;
/** Gare d'ARRIVÉE du tronçon : c'est elle que __probeCruise attend. */
const ARRIVAL = PROTO.arrivalStation;

const out = process.argv[2] ?? '/tmp/plateau-check';
mkdirSync(out, { recursive: true });

const PORT = 5219;
const server = await createServer({ root: process.cwd(), server: { port: PORT }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

const problems = [];
const findings = [];

async function openGame(query) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('requestfailed', (r) => errors.push(`requête échouée: ${r.url()} (${r.failure()?.errorText})`));
  // La qualité est posée AVANT le premier chargement : un reload annulerait
  // les requêtes déjà en vol (manifeste, préchargement du premier chunk) et
  // ferait remonter de faux ERR_ABORTED.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yamanote.quality', 'high');
    } catch {
      /* mode privé */
    }
  });
  await page.goto(`http://localhost:${PORT}/${query}`, { waitUntil: 'networkidle' });
  return { page, errors };
}

async function board(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
    btns.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
    btns[0]?.click();
  });
  await page.waitForFunction(() => typeof window.__probeCruise === 'function', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  // Overlays HTML retirés : on veut juger la scène, pas le HUD.
  await page.addStyleTag({ content: '.app > :not(:first-child){display:none !important}' });
}

// --- 1. Prototype ACTIF -----------------------------------------------------
{
  const { page, errors } = await openGame('?plateau=1');
  await board(page);
  await page.waitForFunction(() => typeof window.__plateauProbe === 'function', { timeout: 30000 });

  // Visée par la baie latérale : c'est là que la ville se joue.
  let aimX = 0;
  let aimY = 0;
  const aim = async (dx, dy) => {
    const ddx = dx - aimX;
    const ddy = dy - aimY;
    if (!ddx && !ddy) return;
    await page.mouse.move(480, 270);
    await page.mouse.down();
    await page.mouse.move(480 + ddx, 270 + ddy, { steps: 3 });
    await page.mouse.up();
    aimX = dx;
    aimY = dy;
  };
  await aim(-230, -30);

  const samples = [];
  // Quatre points du tronçon, du départ à l'arrivée. `phaseT` accompagne la
  // fraction : c'est lui qui commande l'élévation du décor procédural et,
  // sur un tronçon en tranchée, la hauteur des murs de soutènement.
  const JOURNEY = 98; // depart 17 + cruise 59 + brake 22, cf. data/segments.ts
  for (const [tag, fraction] of [
    ['debut', 0.02],
    ['tiers', 0.33],
    ['milieu', 0.6],
    ['fin', 0.92],
  ]) {
    await page.evaluate(
      ([f, t, arrival]) => {
        // segmentAt(arrival) = arrival - 1 : la gare d'ARRIVÉE désigne le
        // tronçon qu'on vient de parcourir.
        window.__probeCruise(arrival, t);
        window.__probeClock(15 * 60 + 30);
        window.__plateauSeek(f);
      },
      [fraction, Math.max(2, fraction * JOURNEY - 17), ARRIVAL],
    );
    // Une frame SwiftShader dure plusieurs secondes, et les poids de tronçon
    // (segEnv) se fondent en ~2,5 s : laisser converger avant de déclencher.
    await new Promise((r) => setTimeout(r, 3200));
    const probe = await page.evaluate(() => window.__plateauProbe());
    samples.push({ tag, ...probe });
    await page.screenshot({ path: join(out, `plateau-${tag}.png`) });
    console.log(
      `→ ${tag}: segment=${probe.segment} coverage=${probe.coverage} chunks=${probe.mountedChunks} ` +
        `s=${probe.distance?.toFixed(1)}/${probe.totalLength?.toFixed(1)} ` +
        `sommets=${probe.vertices} bâtiment le plus proche du wagon=${probe.nearestToCar?.toFixed(1)} m`,
    );
  }

  const active = samples.filter((s) => s.segment === PROTO.segment);
  if (active.length === 0) problems.push(`Le jeu n’a jamais atteint le tronçon ${PROTO.segment}.`);
  for (const s of active) {
    if (s.coverage !== 1) problems.push(`${s.tag}: le monde PLATEAU n’est pas actif (coverage=${s.coverage}).`);
    if (!s.visible) problems.push(`${s.tag}: le groupe PLATEAU est invisible.`);
    if (!(s.mountedChunks >= 1 && s.mountedChunks <= 3)) {
      problems.push(`${s.tag}: ${s.mountedChunks} chunks montés (attendu 1 à 3).`);
    }
    if (!(s.vertices > 0)) problems.push(`${s.tag}: aucun sommet en scène.`);
    if (s.nearestToCar < 3) {
      problems.push(`${s.tag}: un bâtiment passe à ${s.nearestToCar.toFixed(2)} m de l’axe du wagon.`);
    }
    if (!(s.distance >= 0 && s.distance <= s.totalLength + 0.01)) {
      problems.push(`${s.tag}: abscisse ${s.distance} hors du tracé [0, ${s.totalLength}].`);
    }
  }
  const distances = active.map((s) => s.distance);
  if (active.length > 1 && Math.max(...distances) - Math.min(...distances) < 50) {
    problems.push(`Le décor ne se déplace pas : abscisses ${distances.map((d) => d.toFixed(1)).join(', ')}.`);
  }
  findings.push({ mode: 'plateau=1', samples, errors });
  if (errors.length) problems.push(`Erreurs console (plateau=1) : ${errors.join(' | ')}`);
  await page.close();
}

// --- 2. Prototype DÉSACTIVÉ -------------------------------------------------
{
  const { page, errors } = await openGame('?plateau=0');
  await board(page);
  await page.evaluate((arrival) => {
    window.__probeCruise(arrival);
    window.__probeClock(15 * 60 + 30);
  }, ARRIVAL);
  await new Promise((r) => setTimeout(r, 1600));
  const probe = await page.evaluate(() =>
    typeof window.__plateauProbe === 'function' ? window.__plateauProbe() : { absent: true },
  );
  await page.screenshot({ path: join(out, 'plateau-desactive.png') });
  console.log(`→ désactivé: ${JSON.stringify(probe)}`);
  if (probe.absent !== true && (probe.coverage !== 0 || probe.visible)) {
    problems.push(`Prototype désactivé mais toujours monté : ${JSON.stringify(probe)}`);
  }
  findings.push({ mode: 'plateau=0', probe, errors });
  if (errors.length) problems.push(`Erreurs console (plateau=0) : ${errors.join(' | ')}`);
  await page.close();
}

// --- 3. Le monde produit, seul ----------------------------------------------
// /plateau-probe.html montre le monde exporté sans le wagon ni le décor du
// jeu : c'est le seul endroit où l'on juge la géométrie elle-même, sans qu'un
// mur de tranchée ou l'aménagement intérieur ne s'interposent.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  for (const [name, query] of [
    ['apercu', ''],
    ['oeil-350', '?s=350&eye=3'],
    ['oeil-700', '?s=700&eye=3'],
  ]) {
    await page.goto(`http://localhost:${PORT}/plateau-probe.html${query}`, {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => window.__plateauProbeReady === true, { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: join(out, `probe-${name}.png`) });
    console.log(`→ probe ${name}`);
  }
  if (errors.length) problems.push(`Erreurs dans plateau-probe : ${errors.join(' | ')}`);
  findings.push({ mode: 'plateau-probe', errors });
  await page.close();
}

await browser.close();
await server.close();

writeFileSync(join(out, 'visual-check.json'), `${JSON.stringify({ problems, findings }, null, 2)}\n`);
console.log(`\nCaptures et rapport : ${out}`);
if (problems.length > 0) {
  console.error(`\n✖ ${problems.length} problème(s) :`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log('\n✔ Aucun problème détecté.');
}
