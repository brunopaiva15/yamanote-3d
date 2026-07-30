// Grave src/data/melodyManifest.ts : chemin logique d'une 発車メロディ → durée.
//
// Le runtime ne peut pas mesurer un MP3 avant de l'avoir décodé, et il doit
// connaître la longueur de la mélodie AVANT l'arrêt : c'est elle qui fixe la
// fenêtre sonore, donc la durée du dwell (systems/stationCycle). D'où ce
// manifeste, du même esprit que src/data/pa-manifest.ts pour les annonces.
//
// Usage :
//   node scripts/melody-manifest-gen.mjs
//
// À relancer après toute regravure de scripts/melodies-gen.py.
// tests/melodyTiming.test.ts échoue si le manifeste et les fichiers divergent.

import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mp3Duration } from './mp3-duration.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'audio', 'melodies');
const out = join(root, 'src', 'data', 'melodyManifest.ts');

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.mp3'))
  .sort();

const lines = files.map((f) => `  '/audio/melodies/${f}': ${mp3Duration(join(dir, f)).toFixed(2)},`);

writeFileSync(
  out,
  `// Durée (s) de chaque clip de 発車メロディ. GÉNÉRÉ - ne pas éditer à la main :
// \`node scripts/melody-manifest-gen.mjs\` après toute regravure des mélodies.
//
// Pourquoi un manifeste : la fenêtre sonore d'un arrêt est taillée pour DEUX
// passages entiers de la mélodie du quai, et cette fenêtre fixe la durée du
// dwell - donc l'instant de l'annonce de fermeture et celui des portes. Il faut
// donc la longueur du clip avant même de l'avoir chargé (voir data/melodies,
// \`melodyRoundsDuration\`, et systems/stationCycle).

export const MELODY_DURATIONS: Record<string, number> = {
${lines.join('\n')}
};
`,
  'utf8',
);

console.log(`${files.length} mélodies → ${out}`);
