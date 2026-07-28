/**
 * Capture une frame du jeu puis compose la bannière 1500×500 :
 * fond flouté + logo au premier plan.
 *
 * Le logo est capturé via Chromium (pas via sharp/librsvg) pour respecter
 * textLength et la plaque « 3D » à droite de YAMANOTE.
 *
 * Usage : npm run dev (dans un autre terminal), puis
 *         node scripts/capture-banner.mjs http://127.0.0.1:5173
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'assets');
const gameShot = join(outDir, 'game-screenshot.png');
const logoPngPath = join(outDir, 'logo-capture.png');
const bannerOut = join(outDir, 'banner-1500x500.png');
const publicBanner = join(root, 'public', 'banner-1500x500.png');

const WIDTH = 1500;
const HEIGHT = 500;
const LOGO_WIDTH = 900;

async function captureAssets(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('.logo', { timeout: 60_000 });

  // Isoler le SVG logo sur fond transparent (sans le panneau blanc du menu).
  await page.evaluate(() => {
    const logo = document.querySelector('.logo');
    if (!logo) return;
    document.body.innerHTML = '';
    document.body.style.cssText =
      'margin:0;background:transparent;display:flex;align-items:center;justify-content:center;min-height:100vh;';
    document.documentElement.style.background = 'transparent';
    logo.style.cssText = 'width:900px;max-width:none;margin:0;display:block;';
    document.body.appendChild(logo);
  });

  await page.locator('.logo').screenshot({
    path: logoPngPath,
    omitBackground: true,
    timeout: 60_000,
  });
  console.log('Logo :', logoPngPath);

  // Recharger pour capturer le jeu (le DOM a été vidé ci-dessus).
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('.start-button', { timeout: 60_000 });
  await page.evaluate(() => {
    document.querySelector('.start-button')?.click();
  });
  await page.waitForTimeout(12000);
  await page.screenshot({
    path: gameShot,
    type: 'png',
    timeout: 120_000,
    animations: 'disabled',
  });
  await browser.close();
  console.log('Capture jeu :', gameShot);
}

async function composeBanner() {
  const blurredBg = await sharp(gameShot)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
    .blur(20)
    .modulate({ brightness: 0.68, saturation: 1.1 })
    .toBuffer();

  const overlay = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="rgba(16,21,26,0.05)"/>
          <stop offset="100%" stop-color="rgba(16,21,26,0.55)"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#vignette)"/>
    </svg>`,
  );

  const logoPng = await sharp(logoPngPath).resize({ width: LOGO_WIDTH }).png().toBuffer();
  const logoMeta = await sharp(logoPng).metadata();
  const logoLeft = Math.round((WIDTH - (logoMeta.width ?? LOGO_WIDTH)) / 2);
  const logoTop = Math.round((HEIGHT - (logoMeta.height ?? 280)) / 2);

  await sharp(blurredBg)
    .composite([
      { input: overlay, top: 0, left: 0 },
      { input: logoPng, top: logoTop, left: logoLeft },
    ])
    .png()
    .toFile(bannerOut);

  await copyFile(bannerOut, publicBanner);
  console.log('Bannière :', bannerOut);
}

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173';
await mkdir(outDir, { recursive: true });
await captureAssets(baseUrl);
await composeBanner();
