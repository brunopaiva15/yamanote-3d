// LE FONDU, CÔTÉ CANEVAS : verser une image nouvelle sur celle qui est déjà à
// l'écran, sans jamais garder de copie de l'ancienne.
//
// Le calendrier du fondu vit dans `lineScreenAnim`, qui ne connaît pas le
// canevas ; ici il n'y a que la mécanique de composition. Elle tient à une
// remarque : la dalle porte DÉJÀ le mélange des battements précédents. Il n'y a
// donc rien à conserver de l'image d'avant - il suffit d'y verser à chaque
// battement la part que `stepScreenAnim` a calculée, et ce qui reste de
// l'ancienne page se réduit tout seul jusqu'à zéro.
//
// Le seul tampon nécessaire est celui de l'image NEUVE : on ne peut pas la
// peindre directement en transparence, sinon chacun de ses traits se mêlerait à
// ceux qu'il recouvre à l'intérieur même de la page - un texte blanc sur son
// bandeau noir laisserait voir le bandeau à travers ses lettres. On peint donc
// la page au complet, opaque, à côté, puis on pose l'image d'un bloc.

import type { ScreenSurface } from './lineScreen';

interface Scratch {
  surface: ScreenSurface;
  sx: number;
  sy: number;
}

/**
 * Les tampons de composition, un par format de dalle.
 *
 * Partagés entre les surfaces de même format, et c'est sans danger : la
 * peinture est synchrone, le tampon est rempli et reversé avant que la surface
 * suivante ne le demande. Les deux dalles d'une rame - qui ne diffèrent que par
 * le plan des sorties - se passent donc le même.
 */
const SCRATCH = new Map<string, Scratch>();

/**
 * Le tampon au format de la surface, à SA résolution.
 *
 * L'écran de la version sonore peint dans la grille de 768 × 432 mais sur un
 * canevas qui peut être trois fois plus grand (voir `ui/audio/LineScreen`) : la
 * transformation d'échelle est posée sur le contexte. Le tampon la reprend
 * telle quelle, sans quoi les quelques images du fondu seraient un
 * agrandissement flou au milieu d'une dalle nette.
 */
function scratchFor(dst: ScreenSurface): ScreenSurface {
  const m = dst.g.getTransform();
  const sx = m.a || 1;
  const sy = m.d || 1;
  const key = `${dst.w}x${dst.h}`;
  const held = SCRATCH.get(key);
  if (held && held.sx === sx && held.sy === sy) return held.surface;
  const canvas = held
    ? (held.surface.g.canvas as HTMLCanvasElement)
    : document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(dst.w * sx));
  canvas.height = Math.max(1, Math.round(dst.h * sy));
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  g.setTransform(sx, 0, 0, sy, 0, 0);
  const surface: ScreenSurface = { g, w: dst.w, h: dst.h };
  SCRATCH.set(key, { surface, sx, sy });
  return surface;
}

/**
 * Peint une page en la MÊLANT à celle qui est affichée.
 *
 * `blend` est la part de l'image nouvelle à verser à ce battement, telle que la
 * donne `stepScreenAnim` : 1 remplace, et c'est le cas courant - on ne passe
 * par le tampon que pendant la fraction de seconde du fondu.
 */
export function paintBlended(
  dst: ScreenSurface,
  blend: number,
  paint: (s: ScreenSurface) => void,
): void {
  if (blend >= 1) {
    paint(dst);
    return;
  }
  const scratch = scratchFor(dst);
  paint(scratch);
  const g = dst.g;
  const alpha = g.globalAlpha;
  g.globalAlpha = Math.max(0, blend);
  // Le tampon est à l'échelle du canevas de destination ; la destination, elle,
  // travaille dans la grille de peinture. On repose donc le rectangle en
  // coordonnées de grille et la transformation courante fait le reste.
  g.drawImage(scratch.g.canvas, 0, 0, dst.w, dst.h);
  g.globalAlpha = alpha;
}
