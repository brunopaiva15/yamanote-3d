// Génère src/data/stationConcourseReachTable.ts.
//
//   npm run data:reach
//
// Quatre nombres par gare, déduits des trente profils par `deriveReach`. La
// table existe pour que le décor n'ait pas à embarquer le dossier : cent trente
// kio de relevé pour en tirer cent vingt nombres serait un mauvais marché, une
// phase avant que le compilateur n'en ait besoin.
//
// Un test recalcule les trente portées et exige qu'elles soient identiques :
// régénérer sans relire est sans danger, oublier de régénérer ne l'est pas.

import { writeFileSync } from 'node:fs';
import { CONCOURSE_PROFILES } from '../src/data/stationConcourseProfiles.ts';
import { deriveReach } from '../src/data/stationConcourseReach.ts';
import { STATIONS } from '../src/data/stations.ts';

const rows = CONCOURSE_PROFILES.map((p) => {
  const r = deriveReach(p);
  const s = STATIONS[p.stationIndex];
  const n = (v) => Number(v.toFixed(3));
  return `  // ${s.jy} ${s.romaji}\n  { built: ${n(r.built)}, builtNear: ${n(r.builtNear)}, `
    + `shown: ${n(r.shown)}, `
    + `groundNear: ${n(r.groundNear)}, groundFar: ${n(r.groundFar)} },`;
}).join('\n');

const file = `// Ce que le décor doit dégager, gare par gare. NE PAS ÉDITER À LA MAIN.
//
// Généré par \`npm run data:reach\` depuis \`data/stationConcourseProfiles\` et
// \`deriveReach\` (\`data/stationConcourseReach\`), qui est la seule définition
// qui fasse foi. Un test recalcule ces trente lignes et tombe si elles ont
// dérivé — c'est ce qui rend la table sûre : elle ne peut pas mentir sur les
// profils sans que la suite s'arrête.
//
// Toutes les cotes sont en repère quai, en mètres. Voir
// \`data/stationConcourseReach\` pour ce que chacune veut dire.

import type { ConcourseReach } from './stationConcourseReach.ts';

export const CONCOURSE_REACH: readonly ConcourseReach[] = [
${rows}
];
`;

writeFileSync(new URL('../src/data/stationConcourseReachTable.ts', import.meta.url), file);
