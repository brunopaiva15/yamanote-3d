// Harnais de tournage : le jeu dans un Chromium piloté, à horloge VIRTUELLE.
//
// Sous SwiftShader une image coûte plusieurs secondes : enregistrer l'écran
// donnerait un diaporama. On découple donc le temps du jeu du temps réel -
// `performance.now`, `Date.now`, `requestAnimationFrame`, `setTimeout` et
// `setInterval` sont remplacés, dès le premier octet de la page, par une
// horloge qui n'avance que lorsqu'on le lui demande (`__vt.step`). Chaque pas
// fait exactement 1/fps seconde de jeu, quel que soit le temps que la machine
// met à le rendre : la vidéo est parfaitement fluide.
//
// `Math.random` est graine pour la même raison : deux prises du même plan
// doivent donner les mêmes voyageurs, aux mêmes places.

import { chromium } from 'playwright';
import { createServer } from 'vite';

/** Script injecté avant tout module de la page. */
function virtualClock(seed) {
  // --- Hasard graine (mulberry32) ---
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // --- Horloge ---
  // Tant que `enabled` est faux, tout se comporte normalement : le menu, le
  // chargement et la construction de la scène vont à leur rythme. Une fois
  // l'horloge figée, elle repart de l'instant réel où on l'a figée : aucun
  // saut dans le `dt` du jeu.
  const realPerfNow = performance.now.bind(performance);
  const realDateNow = Date.now;
  const realRAF = window.requestAnimationFrame.bind(window);
  const realCancelRAF = window.cancelAnimationFrame.bind(window);
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const realSetInterval = window.setInterval.bind(window);
  const realClearInterval = window.clearInterval.bind(window);

  let enabled = false;
  let vt = 0;
  let dateAtFreeze = 0;
  let perfAtFreeze = 0;
  let rafQueue = new Map();
  let nextId = 1e9;
  const timers = new Map();

  performance.now = () => (enabled ? vt : realPerfNow());
  Date.now = () => (enabled ? dateAtFreeze + (vt - perfAtFreeze) : realDateNow());
  const RealDate = Date;
  // `new Date()` sans argument lit aussi l'horloge.
  window.Date = new Proxy(RealDate, {
    construct(target, args) {
      if (args.length === 0 && enabled) return new target(Date.now());
      return new target(...args);
    },
  });

  window.requestAnimationFrame = (cb) => {
    if (!enabled) return realRAF(cb);
    const id = ++nextId;
    rafQueue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (rafQueue.delete(id)) return;
    realCancelRAF(id);
  };

  const addTimer = (fn, ms, args, repeat) => {
    const id = ++nextId;
    const delay = Math.max(0, Number(ms) || 0);
    timers.set(id, { fn, at: vt + delay, every: repeat ? Math.max(1, delay) : 0, args });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) =>
    enabled ? addTimer(fn, ms, args, false) : realSetTimeout(fn, ms, ...args);
  window.setInterval = (fn, ms, ...args) =>
    enabled ? addTimer(fn, ms, args, true) : realSetInterval(fn, ms, ...args);
  window.clearTimeout = (id) => {
    if (!timers.delete(id)) realClearTimeout(id);
  };
  window.clearInterval = (id) => {
    if (!timers.delete(id)) realClearInterval(id);
  };

  const call = (fn, args) => {
    try {
      if (typeof fn === 'function') fn(...(args ?? []));
    } catch (e) {
      console.error(e);
    }
  };

  window.__vt = {
    freeze() {
      if (enabled) return;
      perfAtFreeze = realPerfNow();
      dateAtFreeze = realDateNow();
      vt = perfAtFreeze;
      enabled = true;
    },
    now: () => vt,
    /** Avance l'horloge de `ms` et joue UNE image. */
    step(ms) {
      const target = vt + ms;
      // Timers échus pendant le pas, dans l'ordre.
      for (;;) {
        let best = null;
        for (const [id, t] of timers) if (t.at <= target && (!best || t.at < best[1].at)) best = [id, t];
        if (!best) break;
        const [id, t] = best;
        vt = Math.max(vt, t.at);
        if (t.every) t.at += t.every;
        else timers.delete(id);
        call(t.fn, t.args);
      }
      vt = target;
      const q = rafQueue;
      rafQueue = new Map();
      for (const cb of q.values()) call(cb, [vt]);
    },
  };
}

export async function launch({ width, height, scale = 1, seed = 20260402, port = 5310, quality = 'ultra' }) {
  // Ni rechargement à chaud ni surveillance des fichiers : un tournage dure
  // des heures, et une retouche du code pendant ce temps ne doit pas recharger
  // la page au milieu d'un plan.
  const server = await createServer({
    root: process.cwd(),
    server: { port, hmr: false, watch: null },
    logLevel: 'error',
  });
  await server.listen();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.error('  ⚠ page :', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('  ⚠ console :', m.text().slice(0, 300));
  });
  await page.addInitScript(virtualClock, seed);
  await page.goto(`http://localhost:${port}/?film`, { waitUntil: 'networkidle' });
  await page.evaluate((q) => {
    localStorage.setItem('yamanote.quality', q);
    localStorage.setItem('yamanote.lang', 'fr');
  }, quality);
  await page.reload({ waitUntil: 'networkidle' });
  return {
    page,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

/** Monte à bord par le vrai menu : date, heure, gare, sens, version 3D. */
export async function board(page, { date, time, station, direction }) {
  await page.fill('#start-date', date);
  await page.fill('#start-time', time);
  await page.selectOption('#start-station', String(station));
  await page.selectOption('#start-direction', direction);
  await page.click('.start-button');
  await page.click('.mode-card--full');
  await page.waitForFunction(() => typeof window.__film === 'object', null, { timeout: 180_000 });
}

/** Avance le jeu de `n` images à `fps`, sans capture. */
export async function advance(page, n, fps = 30) {
  await page.evaluate(
    ([k, ms]) => {
      for (let i = 0; i < k; i++) window.__vt.step(ms);
    },
    [n, 1000 / fps],
  );
}
