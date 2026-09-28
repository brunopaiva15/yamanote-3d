// Rend l'habillage du film (film-overlay.html) en PNG transparents, une image
// par 1/30 s, prêts à être posés sur les plans par compose.mjs.
//
//   node scripts/film/overlay.mjs <dossier>              toutes les images
//   node scripts/film/overlay.mjs <dossier> --at 1,5.2   quelques instants,
//                                                        sur fond gris, pour régler

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const out = args[0];
const atArg = args.includes('--at') ? args[args.indexOf('--at') + 1] : null;
const fps = 30;
mkdirSync(out, { recursive: true });

// Polices (Inter, Noto Sans JP), téléchargées une fois dans scripts/film/.cache
// et servies en local : le Chromium de tournage ne passe pas forcément par le
// même proxy que le reste de la machine.
const FONTS = 'scripts/film/.cache/fonts';
if (!existsSync(join(FONTS, 'local.css'))) {
  mkdirSync(FONTS, { recursive: true });
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
  const url = 'https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800;900&family=Noto+Sans+JP:wght@500;700;900&display=swap';
  const get = (u, file) => {
    const r = spawnSync('curl', ['-sSfL', '-A', ua, '-o', file, u], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`téléchargement impossible : ${u}`);
  };
  get(url, join(FONTS, 'fonts.css'));
  let css = readFileSync(join(FONTS, 'fonts.css'), 'utf8');
  const urls = [...new Set(css.match(/https:\/\/[^)]+/g) ?? [])];
  urls.forEach((u, i) => {
    const name = `f${String(i).padStart(3, '0')}.woff2`;
    if (!existsSync(join(FONTS, name))) get(u, join(FONTS, name));
    css = css.split(u).join(name);
  });
  writeFileSync(join(FONTS, 'local.css'), css);
}

const server = await createServer({
  root: process.cwd(),
  server: { port: 5320, hmr: false, watch: null },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => console.error('  ⚠ page :', e.message));
await page.goto(`http://localhost:5320/film-overlay.html${atArg ? '?bg=1' : ''}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__overlayReady === true);
await page.evaluate(() => document.fonts.ready);
const total = await page.evaluate(() => window.__overlay.total);

const times = atArg
  ? atArg.split(',').map(Number)
  : Array.from({ length: Math.round(total * fps) }, (_, f) => f / fps);
for (let i = 0; i < times.length; i++) {
  const t = times[i];
  await page.evaluate((x) => window.__overlay.set(x), t);
  const name = atArg ? `t${t.toFixed(2)}.png` : `${String(i + 1).padStart(4, '0')}.png`;
  await page.screenshot({ path: join(out, name), omitBackground: !atArg });
  if (!atArg && i % 60 === 0) console.log(`  habillage ${i + 1}/${times.length}`);
}
await browser.close();
await server.close();
