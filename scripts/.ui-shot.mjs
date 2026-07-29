import { chromium } from 'playwright';
import { createServer } from 'vite';
const out = process.argv[2];
const server = await createServer({ root: process.cwd(), server: { port: 5208 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
});
for (const [tag, w, h] of [['desktop', 1100, 620], ['mobile', 390, 720]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error('⚠', e.message));
  await page.goto('http://localhost:5208/', { waitUntil: 'networkidle' });
  await new Promise(r=>setTimeout(r,1500));
  await page.screenshot({ path: `${out}/menu-${tag}.png` });
  await page.evaluate(() => {
    const b=[...document.querySelectorAll('button')].filter(x=>x.offsetParent);
    b.sort((a,c)=>c.offsetWidth*c.offsetHeight-a.offsetWidth*a.offsetHeight); b[0]?.click();
  });
  await page.waitForFunction(() => typeof window.__probeWeather === 'function', { timeout: 30000 });
  await page.evaluate(() => window.__probeWeather({kind:'downpour', rain:1, cloud:1, wet:1, tempC:24.3, visibility:0.45}));
  await new Promise(r=>setTimeout(r,2600));
  await page.screenshot({ path: `${out}/hud-${tag}.png` });
  await page.close();
}
await browser.close(); await server.close();
