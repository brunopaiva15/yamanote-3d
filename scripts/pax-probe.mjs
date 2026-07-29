// Sonde des voyageurs, pilotée dans un vrai navigateur.
//
// Deux questions qu'on ne peut pas trancher à l'œil nu, parce qu'elles se
// jouent sur des minutes :
//
//   - le RYTHME. À quelle fréquence un voyageur change d'occupation, combien
//     de temps il reste sur son téléphone, et combien de disputes éclatent
//     dans un wagon en dix minutes. La boucle est avancée à la main, hors
//     rendu : dix minutes de vie se mesurent en quelques secondes, et le
//     résultat ne dépend pas du framerate de la machine.
//   - la PAROLE. Viser quelqu'un, lui adresser la parole, et vérifier ce que
//     le moteur publie — texte accordé, animation posée, bulle ancrée.
//
//   node scripts/pax-probe.mjs             → dix minutes de vie + un échange
//   node scripts/pax-probe.mjs 30          → trente minutes de vie
//   node scripts/pax-probe.mjs --lines 12  → douze répliques tirées d'affilée

import { chromium } from 'playwright';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const minutes = Number(args.find((a) => /^\d+$/.test(a)) ?? 10);
const lineCount = Number(args[args.indexOf('--lines') + 1]) || (args.includes('--lines') ? 8 : 4);

const server = await createServer({ server: { port: 5205 }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.error('  ⚠ erreur page :', e.message));
await page.goto('http://localhost:5205/', { waitUntil: 'networkidle' });

// Démarrer : le bouton « Monter à bord » est le plus grand de la page.
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
  btns.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  btns[0]?.click();
});
await new Promise((r) => setTimeout(r, 2500));

// --- Rythme ---------------------------------------------------------------

const rhythm = await page.evaluate(async (mins) => {
  const pax = await import('/src/systems/passengers.ts');
  const steps = Math.round(mins * 60 * 60);
  const prev = pax.paxList.map((p) => p.action);
  let changes = 0;
  let samples = 0;
  const dwell = {};
  const starts = {};
  for (let s = 0; s < steps; s++) {
    pax.updatePassengers(1 / 60);
    for (let i = 0; i < pax.paxList.length; i++) {
      const p = pax.paxList[i];
      const posed = p.state === 'seated' || p.state === 'standing';
      if (posed) {
        dwell[p.action] = (dwell[p.action] ?? 0) + 1;
        samples++;
      }
      if (p.action !== prev[i]) {
        if (posed) {
          starts[p.action] = (starts[p.action] ?? 0) + 1;
          changes++;
        }
        prev[i] = p.action;
      }
    }
  }
  const active = pax.paxList.filter((p) => p.state === 'seated' || p.state === 'standing').length;
  const share = Object.entries(dwell)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, +((v / samples) * 100).toFixed(1)]);
  return { active, changes, changesPerPaxPerMin: +(changes / Math.max(1, active) / mins).toFixed(2), share, starts };
}, minutes);

console.log(`\n— Rythme sur ${minutes} min de vie, ${rhythm.active} voyageurs à bord —`);
console.log(`changements d'occupation : ${rhythm.changesPerPaxPerMin} par voyageur et par minute`);
console.log('\ntemps passé (top 12) :');
for (const [id, pct] of rhythm.share.slice(0, 12)) {
  console.log(`  ${String(id).padEnd(14)} ${String(pct).padStart(5)} %  ${'█'.repeat(Math.round(pct / 2))}`);
}
const RARE = ['argue', 'fight', 'angry', 'scold', 'jealous', 'shove', 'flirt', 'sulk', 'fall', 'stumble', 'facepalm', 'gasp'];
console.log(`\névénements rares déclenchés en ${minutes} min :`);
console.log(
  '  ' +
    RARE.map((k) => `${k} ${rhythm.starts[k] ?? 0}`).join(' · '),
);

// --- Parole ---------------------------------------------------------------

const talk = await page.evaluate(async (count) => {
  const conv = await import('/src/systems/conversation.ts');
  const pax = await import('/src/systems/passengers.ts');
  const targeting = await import('/src/systems/paxTargeting.ts');
  const dialogue = await import('/src/data/dialogue/index.ts');
  const rt = (await import('/src/systems/runtime.ts')).runtime;
  const store = (await import('/src/store.ts')).useStore;

  const said = [];
  for (let i = 0; i < count; i++) {
    const p = pax.paxList.filter((q) => q.state === 'seated' || q.state === 'standing')[i % 12];
    if (!p) break;
    // Se placer devant lui et le regarder.
    const headY = p.height * (p.state === 'seated' ? 0.95 : 1.33);
    const wz = p.pos.z + rt.trainZ;
    rt.playerX = p.pos.x - 1.15;
    rt.playerY = 1.55;
    rt.playerZ = wz;
    const dx = p.pos.x - rt.playerX;
    const dy = headY - rt.playerY;
    const len = Math.hypot(dx, dy);
    rt.lookX = dx / len;
    rt.lookY = dy / len;
    rt.lookZ = 0;
    const target = targeting.findTargetedPax();
    if (!target) {
      said.push({ error: 'personne en joue' });
      continue;
    }
    conv.endConversation();
    conv.startConversation(target.scope, target.id, 'ask');
    const a = p.appearance;
    said.push({
      qui: `${a.archetype}${a.feminine ? ' (f)' : ' (m)'}`,
      texte: conv.conversation.text,
      action: p.action,
      lang: store.getState().lang,
    });
    // Laisser le moteur enchaîner les répliques de l'échange.
    for (let s = 0; s < 60 * 25 && conv.conversation.active; s++) {
      conv.updateConversation(1 / 60);
      if (conv.conversation.text && conv.conversation.text !== said[said.length - 1].texte) {
        said.push({ qui: '  ↳', texte: conv.conversation.text });
      }
    }
    conv.endConversation();
  }
  return { catalogue: dialogue.DIALOGUE_COUNT, said };
}, lineCount);

console.log(`\n— Parole : ${talk.catalogue} échanges au catalogue —`);
for (const s of talk.said) {
  if (s.error) console.log(`  ⚠ ${s.error}`);
  else console.log(`  ${String(s.qui).padEnd(20)} « ${s.texte} »`);
}
console.log();

await browser.close();
await server.close();
