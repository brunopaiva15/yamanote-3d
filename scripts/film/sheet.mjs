// Planche contact pour juger les plans : node scripts/film/sheet.mjs sortie.png a.jpg b.jpg …
import sharp from 'sharp';
const [out, ...files] = process.argv.slice(2);
const w = 300, h = 533;
const tiles = await Promise.all(files.map((f) => sharp(f).resize(w, h).toBuffer()));
const cols = Math.min(files.length, 4);
const rows = Math.ceil(files.length / cols);
await sharp({ create: { width: w * cols, height: h * rows, channels: 3, background: '#000' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * w, top: Math.floor(i / cols) * h })))
  .png().toFile(out);
