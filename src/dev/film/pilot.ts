// Pilote de tournage : ce que le réalisateur (dev/film/director) demande au
// joueur, image par image.
//
// Le film ne triche pas : on ne pose pas une caméra à côté du jeu, on conduit
// LE joueur - son regard, son pas, sa main. Il franchit la porte ouverte à
// pied (et c'est ce pas qui bascule son repère, comme en jeu), s'assoit sur
// une vraie place, appuie sur le vrai bouton du distributeur par la visée.
// Ce module ne fait que porter les consignes : il n'importe rien, pour que
// `three/Player` puisse le lire sans tirer le réalisateur dans le jeu.

import type * as THREE from 'three';

export interface FilmPilot {
  /** Le joueur obéit au pilote plutôt qu'au clavier et à la souris. */
  active: boolean;
  /**
   * Appelé en TÊTE de la boucle du joueur, avant qu'il ne lise les consignes :
   * le réalisateur y pose celles de l'image en cours, sans une image de retard.
   */
  tick: ((dt: number, camera: THREE.PerspectiveCamera) => void) | null;
  /** Cap et tangage du regard (rad), mêmes conventions que `three/Player`. */
  yaw: number;
  pitch: number;
  /** Point à rejoindre au pas (repère monde), ou null pour rester sur place. */
  goal: { x: number; z: number } | null;
  /** Vitesse de marche relative (1 = pas normal). */
  pace: number;
  /** Téléportation (repère monde), consommée à l'image suivante. */
  place: { x: number; z: number } | null;
  /** Place à prendre (index de `SEAT_SLOTS`), consommée ; -1 = rien. */
  sit: number;
  /** Se lever, consommé. */
  stand: boolean;
  /** Position de l'œil, publiée par le joueur à chaque image (repère monde). */
  eye: { x: number; y: number; z: number };
}

export const filmPilot: FilmPilot = {
  active: false,
  tick: null,
  yaw: Math.PI,
  pitch: 0,
  goal: null,
  pace: 1,
  place: null,
  sit: -1,
  stand: false,
  eye: { x: 0, y: 0, z: 0 },
};

/**
 * Axes de marche (même repère que `moveAxes()`) qui mènent vers le but du
 * pilote, compte tenu du regard. On repasse par les AXES plutôt que de
 * déplacer le joueur à la main : c'est la marche du jeu qui s'applique, avec
 * ses collisions, son balancement de tête et son changement de repère au seuil.
 */
export function pilotAxes(x: number, z: number, yaw: number): { x: number; y: number } {
  const g = filmPilot.goal;
  if (!g) return { x: 0, y: 0 };
  const dx = g.x - x;
  const dz = g.z - z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return { x: 0, y: 0 };
  // Freinage doux dans les derniers quarante centimètres.
  const k = (Math.min(1, d / 0.4) * filmPilot.pace) / d;
  const vx = dx * k;
  const vz = dz * k;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  return { x: vx * rx + vz * rz, y: vx * fx + vz * fz };
}
