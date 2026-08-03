// Ce que le décor doit dégager, gare par gare. NE PAS ÉDITER À LA MAIN.
//
// Généré par `npm run data:reach` depuis `data/stationConcourseProfiles` et
// `deriveReach` (`data/stationConcourseReach`), qui est la seule définition
// qui fasse foi. Un test recalcule ces trente lignes et tombe si elles ont
// dérivé — c'est ce qui rend la table sûre : elle ne peut pas mentir sur les
// profils sans que la suite s'arrête.
//
// Toutes les cotes sont en repère quai, en mètres. Voir
// `data/stationConcourseReach` pour ce que chacune veut dire.

import type { ConcourseReach } from './stationConcourseReach.ts';

export const CONCOURSE_REACH: readonly ConcourseReach[] = [
  // JY01 Tokyo
  { built: 42.28, builtNear: -56, shown: 77.93, groundNear: 1.78, groundFar: 12.28 },
  // JY02 Kanda
  { built: 7.78, builtNear: 1.78, shown: 7.78, groundNear: 1.78, groundFar: 7.78 },
  // JY03 Akihabara
  { built: 8.18, builtNear: 1.78, shown: 16.18, groundNear: 1.78, groundFar: 8.18 },
  // JY04 Okachimachi
  { built: 8.08, builtNear: 1.78, shown: 8.08, groundNear: 1.78, groundFar: 8.08 },
  // JY05 Ueno
  { built: 40.38, builtNear: -42, shown: 58.03, groundNear: 1.78, groundFar: 10.38 },
  // JY06 Uguisudani
  { built: 8.58, builtNear: -10, shown: 8.58, groundNear: 1.78, groundFar: 8.58 },
  // JY07 Nippori
  { built: 39.43, builtNear: -16, shown: 39.43, groundNear: 1.78, groundFar: 9.78 },
  // JY08 Nishi-Nippori
  { built: 7.98, builtNear: 1.78, shown: 13.98, groundNear: 1.78, groundFar: 7.98 },
  // JY09 Tabata
  { built: 33.63, builtNear: -12, shown: 33.63, groundNear: 1.78, groundFar: 7.98 },
  // JY10 Komagome
  { built: 29.33, builtNear: -8, shown: 29.33, groundNear: 1.78, groundFar: 7.68 },
  // JY11 Sugamo
  { built: 31.63, builtNear: -8, shown: 31.63, groundNear: 1.78, groundFar: 7.98 },
  // JY12 Ōtsuka
  { built: 8.78, builtNear: 1.78, shown: 8.78, groundNear: 1.78, groundFar: 8.78 },
  // JY13 Ikebukuro
  { built: 25.58, builtNear: -44, shown: 47.23, groundNear: 1.78, groundFar: 11.58 },
  // JY14 Mejiro
  { built: 25.43, builtNear: -6, shown: 25.43, groundNear: 1.78, groundFar: 7.78 },
  // JY15 Takadanobaba
  { built: 7.88, builtNear: 1.78, shown: 7.88, groundNear: 1.78, groundFar: 7.88 },
  // JY16 Shin-Ōkubo
  { built: 7.68, builtNear: 1.78, shown: 11.68, groundNear: 1.78, groundFar: 7.68 },
  // JY17 Shinjuku
  { built: 41.83, builtNear: -30, shown: 43.83, groundNear: 1.78, groundFar: 10.18 },
  // JY18 Yoyogi
  { built: 8.18, builtNear: 1.78, shown: 8.18, groundNear: 1.78, groundFar: 8.18 },
  // JY19 Harajuku
  { built: 27.63, builtNear: -20, shown: 27.63, groundNear: 1.78, groundFar: 7.98 },
  // JY20 Shibuya
  { built: 21.78, builtNear: -34, shown: 37.43, groundNear: 1.78, groundFar: 11.78 },
  // JY21 Ebisu
  { built: 8.98, builtNear: 1.78, shown: 32.63, groundNear: 1.78, groundFar: 8.98 },
  // JY22 Meguro
  { built: 31.83, builtNear: -8, shown: 31.83, groundNear: 1.78, groundFar: 8.18 },
  // JY23 Gotanda
  { built: 8.38, builtNear: 1.78, shown: 13.38, groundNear: 1.78, groundFar: 8.38 },
  // JY24 Ōsaki
  { built: 44.23, builtNear: -46, shown: 44.23, groundNear: 1.78, groundFar: 10.58 },
  // JY25 Shinagawa
  { built: 50.83, builtNear: -60, shown: 50.83, groundNear: 1.78, groundFar: 11.18 },
  // JY26 Takanawa Gateway
  { built: 40.43, builtNear: -14, shown: 40.43, groundNear: 1.78, groundFar: 10.78 },
  // JY27 Tamachi
  { built: 36.63, builtNear: -32, shown: 36.63, groundNear: 1.78, groundFar: 8.98 },
  // JY28 Hamamatsuchō
  { built: 34.03, builtNear: -10, shown: 34.03, groundNear: 1.78, groundFar: 8.38 },
  // JY29 Shimbashi
  { built: 9.18, builtNear: 1.78, shown: 9.18, groundNear: 1.78, groundFar: 9.18 },
  // JY30 Yūrakuchō
  { built: 7.78, builtNear: 1.78, shown: 7.78, groundNear: 1.78, groundFar: 7.78 },
];
