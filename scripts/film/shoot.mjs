// Tournage du film vertical, image par image (voir src/dev/film/director).
//
//   node scripts/film/shoot.mjs <dossier> [options]
//
//   --shots a,b,c   plans à tourner (noms), tous par défaut
//   --size 540x960  fenêtre CSS ; --scale 2 pour une sortie 1080×1920
//   --fps 30
//   --stills 3      planche de repérage : N images par plan seulement, les
//                   autres sont simulées sans être rendues (bien plus rapide)
//
// Chaque plan est écrit dans <dossier>/<nom>/0001.jpg… ; un plan déjà complet
// est sauté, ce qui permet de reprendre un tournage interrompu.

import { mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './harness.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out) throw new Error('usage : shoot.mjs <dossier> [--shots …] [--size WxH] [--scale k] [--stills n]');
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const [W, H] = opt('size', '540x960').split('x').map(Number);
const scale = Number(opt('scale', '1'));
const fps = Number(opt('fps', '30'));
const stills = Number(opt('stills', '0'));
const wanted = opt('shots', '')?.split(',').filter(Boolean) ?? [];
const quality = opt('quality', 'ultra');
const force = args.includes('--force');

mkdirSync(out, { recursive: true });
const { page, close } = await launch({ width: W, height: H, scale, quality, port: Number(opt('port', '5311')) });

// Monter à bord par le vrai menu : le 2 avril (les cerisiers), 7 h 38, Shibuya.
await page.fill('#start-date', '2026-04-02');
await page.fill('#start-time', '07:38');
await page.selectOption('#start-station', '19');
await page.selectOption('#start-direction', 'inner');
await page.click('.start-button');
await page.click('.mode-card--full');
await page.waitForFunction(() => typeof window.__film === 'object', null, { timeout: 180_000 });
// Laisser la scène se construire et les voyageurs se charger, en temps réel.
await new Promise((r) => setTimeout(r, 8000));
await page.evaluate(() => window.__vt.freeze());

const shots = await page.evaluate(() => window.__film.shots);
const dtMs = 1000 / fps;
const step = () => page.evaluate((ms) => window.__vt.step(ms), dtMs);
const log = [];

for (let i = 0; i < shots.length; i++) {
  const { name, dur } = shots[i];
  if (wanted.length && !wanted.includes(name)) continue;
  const dir = join(out, name);
  const frames = Math.round(dur * fps);
  if (!force && !stills && existsSync(dir) && readdirSync(dir).filter((f) => f.endsWith('.jpg')).length >= frames) {
    console.log(`= ${name} déjà tourné`);
    continue;
  }
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  await page.evaluate((k) => window.__film.cut(k), i);
  // Préparation : au moins une demi-seconde, le temps que tout se pose.
  let prep = 0;
  while (prep < 15 || !(await page.evaluate(() => window.__film.isReady()))) {
    await step();
    if (++prep > 6000) throw new Error(`${name} : jamais prêt ${JSON.stringify(await page.evaluate(() => window.__film.state()))}`);
  }
  await page.evaluate(() => window.__film.roll());
  const keep = stills
    ? new Set(Array.from({ length: stills }, (_, k) => Math.round((k * (frames - 1)) / Math.max(1, stills - 1))))
    : null;
  for (let f = 0; f < frames; f++) {
    const shoot = !keep || keep.has(f);
    await page.evaluate((b) => window.__film.blind(b), !shoot);
    await step();
    if (!shoot) continue;
    await page.screenshot({ path: join(dir, `${String(f + 1).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
    if (f % 15 === 0 || keep) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`  ${name} ${f + 1}/${frames}  ${el.toFixed(0)} s\n`);
    }
  }
  await page.evaluate(() => window.__film.blind(false));
  const state = await page.evaluate(() => window.__film.state());
  log.push({ name, prep, secs: (Date.now() - t0) / 1000, state });
  console.log(`✓ ${name} (préparation ${prep} images, ${((Date.now() - t0) / 1000).toFixed(0)} s)`, JSON.stringify(state));
}

writeFileSync(join(out, 'log.json'), JSON.stringify(log, null, 2));
await close();
