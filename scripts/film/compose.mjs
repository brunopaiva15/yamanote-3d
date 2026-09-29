// Montage du film vertical : les plans tournés bout à bout, l'habillage par
// dessus, un étalonnage léger, puis H.264 prêt pour TikTok (1080×1920, 30 i/s,
// piste audio muette - la musique se pose dans l'application).
//
//   node --experimental-strip-types scripts/film/compose.mjs \
//        <plans> <habillage|-> <sortie.mp4> [--ffmpeg /chemin/ffmpeg]
//
// `-` à la place du dossier d'habillage donne la version sans texte.

import { mkdirSync, readdirSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FPS, TIMELINE } from '../../src/dev/film/timeline.ts';

const args = process.argv.slice(2);
const [shotsDir, overlayDir, outFile] = args;
if (!outFile) throw new Error('usage : compose.mjs <plans> <habillage|-> <sortie.mp4>');
const ffmpeg = args.includes('--ffmpeg') ? args[args.indexOf('--ffmpeg') + 1] : process.env.FFMPEG ?? 'ffmpeg';
// Débit visé : TikTok réencode autour de 8 à 10 Mb/s. Au-delà, on n'envoie que
// du grain qu'il jettera ; en deçà, les aplats du rendu se mettent à baver.
const bitrate = args.includes('--bitrate') ? args[args.indexOf('--bitrate') + 1] : '8.5M';

// Une seule séquence numérotée, dans l'ordre du montage.
const seq = resolve(shotsDir, '.seq');
rmSync(seq, { recursive: true, force: true });
mkdirSync(seq);
let n = 0;
for (const { name, dur } of TIMELINE) {
  const dir = join(shotsDir, name);
  const want = Math.round(dur * FPS);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort() : [];
  if (files.length < want) throw new Error(`${name} : ${files.length}/${want} images`);
  for (const f of files.slice(0, want)) symlinkSync(resolve(dir, f), join(seq, `${String(++n).padStart(5, '0')}.jpg`));
}
console.log(`${n} images, ${(n / FPS).toFixed(2)} s`);

// Étalonnage : un peu de contraste et de couleur, un vignetage doux, un grain
// très fin qui casse les aplats du rendu temps réel.
const grade = [
  'scale=1080:1920:flags=lanczos',
  'eq=contrast=1.06:saturation=1.12:gamma=0.98',
  'vignette=angle=PI/5.5',
  'noise=alls=2:allf=t',
].join(',');

const inputs = ['-framerate', String(FPS), '-i', join(seq, '%05d.jpg')];
let filter = `[0:v]${grade}[base]`;
if (overlayDir !== '-') {
  inputs.push('-framerate', String(FPS), '-i', join(overlayDir, '%04d.png'));
  filter += ';[base][1:v]overlay=0:0:format=auto[v]';
} else {
  filter += ';[base]null[v]';
}
const audioIndex = overlayDir !== '-' ? 2 : 1;
inputs.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');

const cmd = [
  '-y',
  ...inputs,
  '-filter_complex', `${filter};[v]format=yuv420p[out]`,
  '-map', '[out]',
  '-map', `${audioIndex}:a`,
  '-frames:v', String(n),
  '-c:v', 'libx264', '-preset', 'slow', '-b:v', bitrate, '-maxrate', '11M', '-bufsize', '16M',
  '-profile:v', 'high', '-level', '4.2',
  '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '128k', '-shortest',
  '-movflags', '+faststart',
  outFile,
];
const r = spawnSync(ffmpeg, cmd, { stdio: ['ignore', 'inherit', 'inherit'] });
rmSync(seq, { recursive: true, force: true });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('→', outFile);
