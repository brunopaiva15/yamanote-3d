// Durée (s) de chaque clip de 発車メロディ. GÉNÉRÉ - ne pas éditer à la main :
// `node scripts/melody-manifest-gen.mjs` après toute regravure des mélodies.
//
// Pourquoi un manifeste : la fenêtre sonore d'un arrêt est taillée pour DEUX
// passages entiers de la mélodie du quai, et cette fenêtre fixe la durée du
// dwell - donc l'instant de l'annonce de fermeture et celui des portes. Il faut
// donc la longueur du clip avant même de l'avoir chargé (voir data/melodies,
// `melodyRoundsDuration`, et systems/stationCycle).

export const MELODY_DURATIONS: Record<string, number> = {
  '/audio/melodies/01_jre-ikst-010-01_inner-main.mp3': 10.48,
  '/audio/melodies/02_jre-ikst-010-02_outer-main.mp3': 10.48,
  '/audio/melodies/03_jre-ikst-010-03_inner-secondary-osaki.mp3': 8.88,
  '/audio/melodies/04_jre-ikst-010-05_outer-secondary-osaki.mp3': 8.31,
  '/audio/melodies/05_sakura-sakura-a.mp3': 13.61,
  '/audio/melodies/06_sakura-sakura-b.mp3': 13.43,
  '/audio/melodies/08_haru-tremolo.mp3': 9.40,
  '/audio/melodies/09_seseragi.mp3': 8.18,
  '/audio/melodies/10_tetsuwan-atom-a.mp3': 6.84,
  '/audio/melodies/11_tetsuwan-atom-b.mp3': 6.43,
  '/audio/melodies/13_the-third-man-f.mp3': 11.23,
  '/audio/melodies/14_glorious-gateway-a.mp3': 10.74,
  '/audio/melodies/15_glorious-gateway-b.mp3': 10.21,
  '/audio/melodies/16_mondamin-cm-song-a.mp3': 8.07,
  '/audio/melodies/17_mondamin-cm-song-b.mp3': 7.60,
  '/audio/melodies/18_bic-camera-theme-a.mp3': 7.99,
  '/audio/melodies/19_bic-camera-theme-b.mp3': 7.31,
  '/audio/melodies/20_jre-ikst-010-01_inner-main-v2.mp3': 10.37,
  '/audio/melodies/21_jre-ikst-010-02_outer-main-v2.mp3': 10.37,
};
