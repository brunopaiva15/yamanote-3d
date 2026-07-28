/**
 * Capture une frame du jeu puis compose la bannière 1600×400 :
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

const WIDTH = 1600;
const HEIGHT = 400;

/** Variantes : logo standard (820 px) et logo discret (340 px). */
const VARIANTS = [
  { name: 'banner-1600x400', logoWidth: 820, public: true },
  { name: 'banner-1600x400-small', logoWidth: 340, public: true },
];

async function captureAssets(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('.logo', { timeout: 60_000 });

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

async function composeVariant({ name, logoWidth, public: toPublic }) {
  const bannerOut = join(outDir, `${name}.png`);

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

  const logoPng = await sharp(logoPngPath).resize({ width: logoWidth }).png().toBuffer();
  const logoMeta = await sharp(logoPng).metadata();
  const logoLeft = Math.round((WIDTH - (logoMeta.width ?? logoWidth)) / 2);
  const logoTop = Math.round((HEIGHT - (logoMeta.height ?? 280)) / 2);

  await sharp(blurredBg)
    .composite([
      { input: overlay, top: 0, left: 0 },
      { input: logoPng, top: logoTop, left: logoLeft },
    ])
    .png()
    .toFile(bannerOut);

  if (toPublic) {
    await copyFile(bannerOut, join(root, 'public', `${name}.png`));
  }
  console.log(`Bannière (${logoWidth}px) :`, bannerOut);
}

async function composeBanners() {
  for (const variant of VARIANTS) {
    await composeVariant(variant);
  }
}

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173';
const composeOnly = process.argv.includes('--compose-only');

await mkdir(outDir, { recursive: true });
if (!composeOnly) {
  await captureAssets(baseUrl);
}
await composeBanners();
