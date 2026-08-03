// La dalle, côté SCÈNE : un canevas hors écran enveloppé dans une texture
// three.
//
// C'est tout ce qui restait de three.js dans les deux mille lignes de peinture
// de `lineScreen` - trois lignes, pour un import qui coûtait sept cent
// kilo-octets à qui voulait seulement dessiner l'afficheur. Il est ici, et la
// peinture, elle, ne connaît plus qu'une surface : un contexte 2D et ses deux
// dimensions (`ScreenSurface`).
//
// Ce qui le permet est simple : aucune fonction de dessin n'a jamais touché à
// la texture. Elles peignent, l'appelant publie - `texture.needsUpdate = true`
// est dans three/Screens, à côté de la boucle d'images qui sait quand la dalle
// doit être renvoyée au GPU.

import * as THREE from 'three';
import type { ScreenSurface } from './lineScreen';

export interface TexturedScreen extends ScreenSurface {
  texture: THREE.CanvasTexture;
}

export function makeScreen(w: number, h: number): TexturedScreen {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { g, texture, w, h };
}
