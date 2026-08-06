// Banc d'essai des robinets de rendu du moteur audio, sans écran.
//
//   node scripts/audio-probe.mjs
//
// Il fait tourner /audio-probe.html dans un vrai navigateur, avec un vrai
// contexte Web Audio, et vérifie pour chaque ligne du graphe les deux moitiés
// du contrat : elle se DÉBRANCHE quand personne ne l'écoute, et elle SONNE
// quand on l'appelle. La seconde moitié est la seule qui compte vraiment - une
// ligne qui reste branchée coûte du calcul, une ligne qui reste débranchée
// coûte une annonce.
//
// Sort 0 si tout tient, 1 sinon, et affiche le détail. La mesure est faite en
// sortie de mixage, sur le signal réellement produit.

import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  root: process.cwd(),
  server: { port: 5211 },
  logLevel: 'error',
});
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
  // Le contexte audio doit démarrer et RENDRE : sans périphérique de sortie,
  // Chrome se rabat sur un puits silencieux, ce qui suffit - le graphe est
  // calculé, et c'est lui qu'on mesure.
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  // Un clip absent (404) n'est PAS une erreur : c'est le chemin de repli du
  // moteur - pas de door-open.mp3 déposé, on synthétise le carillon. C'est même
  // ce que le banc d'essai fait passer par la synthèse.
  if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
});

const q = process.argv.includes('--nogates') ? '?nogates=1' : '';
await page.goto(`http://localhost:5211/audio-probe.html${q}`, { waitUntil: 'networkidle' });
await page.click('#go');
// Deux tournées de douze cas, huit secondes chacun : large.
await page.waitForSelector('body[data-done="1"]', { timeout: 420000 });

const results = JSON.parse(await page.evaluate(() => document.body.dataset.results));

let failed = 0;
for (const r of results) {
  const ok = r.closed && r.heard;
  if (!ok) failed++;
  const why = [
    r.closed ? null : `robinet « ${r.gate ?? '?'} » resté branché au repos${r.note ? ` (${r.note})` : ''}`,
    r.heard ? null : `AUCUN SON en sortie${r.note ? ` (${r.note})` : ''}`,
  ]
    .filter(Boolean)
    .join(' / ');
  console.log(`${ok ? '✓' : '✗'} ${r.name}${why ? ` — ${why}` : ''}  [${r.level.toExponential(2)}]`);
}

for (const e of errors) {
  failed++;
  console.log(`✗ exception : ${e}`);
}

await browser.close();
await server.close();

console.log(failed === 0 ? '\nTout tient.' : `\n${failed} défaut(s).`);
process.exit(failed === 0 ? 0 : 1);
