import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
const OUT = '/tmp/claude-0/-home-user-yamanote-3d/5d0fc796-2b0f-57bf-be70-0b8dd7040339/scratchpad/shots3';
mkdirSync(OUT, { recursive: true });
const STATION = Number(process.argv[2] ?? 0);
const server = await createServer({ server: { port: 5202 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('  page:', e.message));
await page.goto('http://localhost:5202/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent);
  b.sort((p, q) => q.offsetWidth * q.offsetHeight - p.offsetWidth * p.offsetHeight);
  b[0]?.click();
});
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => typeof window.__probeGo === 'function', { timeout: 20000 });
await page.evaluate((i) => window.__probeGoto(i, 'dwell'), STATION);
await new Promise((r) => setTimeout(r, 2500));
for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => window.__probeWhere());
  if (st.frame === 'platform') break;
  await page.evaluate(() => window.__crossPortal());
  await new Promise((r) => setTimeout(r, 500));
}
const geom = await page.evaluate(() => window.__probeInterior());
for (const [name, x, z, lx, lz] of geom.placement) {
  await page.evaluate(([px, pz]) => window.__probeGo(px, pz), [x, z]);
  await page.evaluate(([px, pz]) => window.__lookAt(px, pz), [lx, lz]);
  await new Promise((r2) => setTimeout(r2, 2500));
  await page.screenshot({ path: `${OUT}/s${STATION}-${name}.png` });
  console.log(`  ${name}`, JSON.stringify(await page.evaluate(() => window.__probeWhere())));
}
await browser.close();
await server.close();
