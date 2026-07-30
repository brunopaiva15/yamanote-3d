// Durée d'un MP3, lue dans ses en-têtes de trame.
//
// Le jeu a besoin de connaître la longueur des 発車メロディ AVANT de les jouer :
// la fenêtre sonore d'un arrêt est taillée pour deux passages entiers, et c'est
// elle qui fixe la durée du dwell (voir systems/stationCycle). Un décodeur
// complet serait de trop pour ça - la somme des trames suffit, et se calcule
// sans dépendance.
//
// Utilisé par scripts/melody-manifest-gen.mjs (qui grave src/data/melodyManifest.ts)
// et par tests/melodyTiming.test.ts (qui vérifie que le manifeste n'a pas dérivé
// des fichiers).

import { readFileSync } from 'node:fs';

// Tables MPEG-1 layer III : débits (kb/s) et fréquences d'échantillonnage.
const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const SAMPLE_RATES = [44100, 48000, 32000];
const SAMPLES_PER_FRAME = 1152;

/** Taille de l'en-tête ID3v2 en tête de fichier, s'il y en a un. */
function id3Size(buf) {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return 0;
  const size =
    ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  return 10 + size;
}

/**
 * Durée du MP3 en secondes, à la trame près.
 * @param {string} file chemin du fichier
 * @returns {number}
 */
export function mp3Duration(file) {
  const buf = readFileSync(file);
  let i = id3Size(buf);
  let frames = 0;
  let sampleRate = 0;

  while (i < buf.length - 4) {
    // Synchro : onze bits à 1. Tout le reste est du remplissage ou une balise.
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const bitrate = BITRATES[(buf[i + 2] >> 4) & 0x0f];
    const rate = SAMPLE_RATES[(buf[i + 2] >> 2) & 0x03];
    if (!bitrate || !rate) {
      i++;
      continue;
    }
    const padding = (buf[i + 2] >> 1) & 1;
    frames++;
    sampleRate = rate;
    i += Math.floor((144 * bitrate * 1000) / rate) + padding;
  }

  if (!frames) throw new Error(`aucune trame MPEG dans ${file}`);
  return (frames * SAMPLES_PER_FRAME) / sampleRate;
}
