// CE QUE LE RELEVÉ COÛTE, mesuré avant et après.
//
//   node scripts/concourse-cost.mjs            → le tableau des trente gares
//   node scripts/concourse-cost.mjs --gpu      → et le coût de rendu, au navigateur
//
// La question de la phase 28 n'est pas « est-ce rapide ? » — un hall de gare
// n'est pas ce qui coûte dans cette scène — mais « de combien le relevé a-t-il
// alourdi ce qui existait ? ». On mesure donc les DEUX chemins pour les trente
// gares : le hall générique (`legacyNetwork` sur `interiorFor`) et le relevé
// compilé (`networkFor`). Les vingt-neuf gares branchées ne prennent que le
// second en vrai ; le premier reste calculable, et c'est lui l'« avant ».
//
// TROIS COÛTS, ET ILS NE SE COMPARENT PAS :
//
//   · la COMPILATION, payée une fois par gare au chargement. Elle n'a de sens
//     qu'en microsecondes cumulées sur trente gares — c'est ce qu'un joueur
//     paie en tout, une seule fois ;
//   · la MARCHE, payée à chaque image par chaque voyageur. C'est le seul coût
//     qui puisse se voir, et il se mesure en appels par seconde ;
//   · le RENDU, payé à chaque image tout court. Il ne se mesure pas ici — il
//     faut une carte graphique et une scène montée — mais au navigateur, avec
//     `--gpu`, et par les APPELS et les TRIANGLES, qui ne dépendent pas de la
//     machine. Le temps par image, lui, ne voudrait rien dire sous SwiftShader.
//
// Les chiffres de structure (pièces, obstacles, baies) sont, eux, exacts et
// reproductibles : c'est sur eux que `tests/stationConcourseCost` tient un
// budget, parce qu'un temps mesuré sur une machine partagée ne tient rien.

import { register } from 'node:module';

register('../tests/fixtures/ts-resolve.mjs', import.meta.url);

const { legacyNetwork, concourseBays, networkFor, shellsOf } =
  await import('../src/data/stationConcourseBuild.ts');
const { interiorFor } = await import('../src/data/stationInterior.ts');
const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { concourseFloorAt, walkerBlocked } = await import('../src/systems/stationLevels.ts');
const { routeFromStreet, routeToStreet, stationInteriorOpen } =
  await import('../src/systems/concourseRoute.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');
const { runtime } = await import('../src/systems/runtime.ts');

const GATES = psdGates();
const NAME = (i) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
runtime.playerLevel = 'platform';

/** Ce qu'un réseau pèse, en objets. Aucun temps : ces chiffres sont exacts. */
function weigh(net) {
  return {
    pièces: net.rooms.length,
    praticables: net.rooms.filter((r) => r.walkable).length,
    volumes: shellsOf(net).length,
    liens: net.joins.length,
    lignes: net.gates.length,
    baies: concourseBays(net).length,
    bouches: net.mouths.length,
    obstacles: net.obstacles.length,
    meubles: net.fixtures.length,
    devantures: net.frontages.length,
    repères: net.landmarks.length,
  };
}

/** Le temps médian d'un appel, en microsecondes. La médiane, pas la moyenne. */
function median(run, times) {
  const out = [];
  for (let k = 0; k < times; k++) {
    const t0 = process.hrtime.bigint();
    run();
    out.push(Number(process.hrtime.bigint() - t0) / 1000);
  }
  out.sort((a, b) => a - b);
  return out[Math.floor(out.length / 2)];
}

// --- 1. La structure, gare par gare --------------------------------------

const before = [];
const after = [];
for (let i = 0; i < STATION_COUNT; i++) {
  const place = placementFor(i, GATES);
  const it = place.interior;
  before.push(weigh(legacyNetwork(i, it)));
  after.push(weigh(place.network));
}

const KEYS = Object.keys(before[0]);
const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0);

console.log('\n══ CE QUE LE RELEVÉ AJOUTE, sur les trente gares ══\n');
console.log('  poste            hall générique      relevé        écart');
for (const k of KEYS) {
  const a = sum(before, k);
  const b = sum(after, k);
  const d = b - a;
  console.log(
    `  ${k.padEnd(16)}${String(a).padStart(10)}${String(b).padStart(14)}`
    + `${(d >= 0 ? `+${d}` : String(d)).padStart(13)}`,
  );
}

console.log('\n  Les cinq gares les plus lourdes du relevé :');
const heavy = after
  .map((r, i) => ({ i, n: r.obstacles + r.pièces * 10 }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 5);
for (const { i } of heavy) {
  const r = after[i];
  console.log(
    `    ${NAME(i).padEnd(24)}${r.pièces} pièces, ${r.lignes} lignes, `
    + `${r.baies} baies, ${r.obstacles} obstacles`,
  );
}

// --- 2. La compilation ----------------------------------------------------

console.log('\n══ COMPILATION — payée une fois, au chargement ══\n');
for (const [label, build] of [
  ['hall générique', (i) => legacyNetwork(i, interiorFor(i, 0))],
  ['relevé compilé', (i) => networkFor(i, 0)],
]) {
  let total = 0;
  let worst = { i: 0, us: 0 };
  for (let i = 0; i < STATION_COUNT; i++) {
    const us = median(() => build(i), 21);
    total += us;
    if (us > worst.us) worst = { i, us };
  }
  console.log(
    `  ${label.padEnd(16)}${total.toFixed(0).padStart(6)} µs pour trente gares`
    + `   (la plus longue : ${NAME(worst.i)}, ${worst.us.toFixed(0)} µs)`,
  );
}

// --- 3. La marche ---------------------------------------------------------
//
// C'est le seul coût qui se paie à chaque image : `walkerBlocked` est appelé
// une fois par voyageur et par pas, et il parcourt la liste des obstacles.

console.log('\n══ MARCHE — payée à chaque image, par chaque voyageur ══\n');
for (const [label, pick] of [
  ['hall générique', (i) => ({ ...placementFor(i, GATES), network: legacyNetwork(i, placementFor(i, GATES).interior) })],
  ['relevé compilé', (i) => placementFor(i, GATES)],
]) {
  let calls = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < STATION_COUNT; i++) {
    const p = pick(i);
    const r = p.network.rooms.find((q) => q.walkable)?.rect;
    if (!r) continue;
    for (let k = 0; k < 4000; k++) {
      const x = r.x0 + ((k * 7919) % 997) / 997 * (r.x1 - r.x0);
      const z = r.z0 + ((k * 6271) % 991) / 991 * (r.z1 - r.z0);
      walkerBlocked(p, 'concourse', x, z);
      concourseFloorAt(p, x, z);
      calls += 2;
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(
    `  ${label.padEnd(16)}${(calls / ms / 1000).toFixed(2).padStart(7)} M appels/s`
    + `   (${calls} appels en ${ms.toFixed(0)} ms)`,
  );
}

// --- 4. Les itinéraires ---------------------------------------------------
//
// Un itinéraire se calcule une fois par voyageur, à sa naissance. Trente
// voyageurs par gare et par minute : ce coût-là n'a jamais été le sujet, mais
// il a doublé de longueur avec le relevé et il faut le dire.

console.log('\n══ ITINÉRAIRES — payés une fois par voyageur ══\n');
let stops = 0;
let routes = 0;
const tr = process.hrtime.bigint();
for (let i = 0; i < STATION_COUNT; i++) {
  const p = placementFor(i, GATES);
  if (!stationInteriorOpen(p)) continue;
  for (let k = 0; k < 200; k++) {
    stops += routeToStreet(p)?.length ?? 0;
    stops += routeFromStreet(p)?.stops.length ?? 0;
    routes += 2;
  }
}
const rms = Number(process.hrtime.bigint() - tr) / 1e6;
console.log(
  `  relevé compilé  ${(rms / routes * 1000).toFixed(0).padStart(7)} µs par itinéraire`
  + `   (${(stops / routes).toFixed(1)} étapes en moyenne, ${routes} tirages)`,
);

// --- 5. Le rendu, au navigateur ------------------------------------------

if (process.argv.includes('--gpu')) {
  const { chromium } = await import('playwright');
  const { createServer } = await import('vite');
  const server = await createServer({ server: { port: 5207 }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
  await page.goto('http://localhost:5207/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent);
    b.sort((a, c) => c.offsetWidth * c.offsetHeight - a.offsetWidth * a.offsetHeight);
    b[0]?.click();
  });
  await page.waitForFunction(() => typeof window.__probeInterior === 'function', { timeout: 30000 });

  // Les gares à sonder : celles qu'on donne, ou huit choisies pour couvrir
  // l'éventail — le plus petit hall, le plus grand, un pont-concourse, un
  // dessous de viaduc, une gare à plusieurs volumes.
  const only = process.argv.filter((a) => /^\d+$/.test(a)).map(Number);
  const SPREAD = only.length ? only : [15, 11, 8, 6, 18, 24, 12, 0];
  console.log('\n══ RENDU — appels et triangles, DANS le hall ══\n');
  console.log('  gare                        appels   triangles   maillages');
  for (const i of SPREAD) {
    await page.evaluate((k) => window.__probeGoto(k), i);
    await new Promise((r) => setTimeout(r, 1200));
    // Le point de vue est celui de la sonde — « 02-zone-payante », au milieu du
    // hall payant, tourné vers le contrôle — et non un point choisi ici : c'est
    // le même cadrage que les captures de la phase 27, donc la même mesure.
    const ok = await page.evaluate(() => {
      const { placement } = window.__probeInterior();
      const leg = placement.find((l) => l[0] === '02-zone-payante');
      if (!leg) return false;
      const [, fx, fz, tx, tz] = leg;
      const go = window.__probeStand(fx, fz, 'concourse');
      window.__lookAt(tx, tz);
      return Number.isFinite(go.y);
    });
    if (!ok) {
      console.log(`  ${NAME(i).padEnd(24)} pas de vue posée dans la zone payante`);
      continue;
    }
    await new Promise((r) => setTimeout(r, 1500));
    await page.evaluate(() => {
      window.__probePerfReset();
      window.__frames = 0;
      const loop = () => { window.__frames++; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    await new Promise((r) => setTimeout(r, 5000));
    const raw = await page.evaluate(() => ({ ...window.__probePerf(), frames: window.__frames }));
    const f = Math.max(1, raw.frames);
    console.log(
      `  ${NAME(i).padEnd(24)}${String(Math.round(raw.calls / f)).padStart(8)}`
      + `${String(Math.round(raw.triangles / f)).padStart(12)}${String(raw.meshes).padStart(12)}`,
    );
  }
  await browser.close();
  await server.close();
}

console.log('');
