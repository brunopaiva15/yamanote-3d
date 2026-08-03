// L'écran GAUCHE, et les dalles d'about : de la publicité en boucle, jamais
// d'information voyageurs - comme dans les vraies E235.
//
// Séparé de `lineScreen` pour une raison de dépendances et non de propreté :
// c'est la seule vue de l'afficheur qui appelle les fabriques de textures
// procédurales, lesquelles construisent des `CanvasTexture` et importent donc
// three.js. Tant qu'elle était dans le même fichier, l'écran de LIGNE - celui
// qui dit où va le train - ne pouvait pas être dessiné hors de la scène 3D.
//
// La version sonore du jeu affiche le second et n'a que faire du premier : on
// ne met pas de bandeau publicitaire dans une interface qui n'a que du texte à
// donner.

import { drawAdInto } from '../textures/procedural';
import type { ScreenSurface } from './lineScreen';

export function drawLeftAd(s: ScreenSurface, seed: number): void {
  const { g, w, h } = s;
  drawAdInto(g, w, h, seed);
  g.textAlign = 'left';
}
