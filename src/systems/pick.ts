// Ce que le réticule touche VRAIMENT.
//
// Il n'y a pas d'interface dans une gare. On n'ouvre pas un écran devant ses
// yeux pour acheter un thé : on regarde un bouton, et on appuie dessus. Ce
// module est ce qui rend cela possible - un rayon tiré du milieu de l'écran, et
// la PIÈCE de mobilier qu'il rencontre.
//
// POURQUOI UN REGISTRE plutôt que de sonder toute la scène. Une gare monte des
// dizaines de milliers de triangles, dont beaucoup en instances - la foule, la
// trousse de quai, les caissons. Les traverser soixante fois par seconde pour
// trouver un bouton de six centimètres serait absurde. Les objets qui RÉPONDENT
// s'inscrivent donc eux-mêmes, et ils sont une poignée : cinq pièces par
// distributeur, trois par 券売機, deux par portillon.
//
// Chaque objet porte son action dans `userData.act`. Quand la pièce est une
// SURFACE découpée - la vitrine d'un distributeur, l'écran tactile d'un
// 券売機 -, l'action dit sa trame et c'est la coordonnée de texture du point
// touché qui désigne la case. C'est exactement ce que fait un écran tactile, et
// cela évite de poser un maillage par bouton.

import * as THREE from 'three';

/** Ce qu'une pièce de mobilier sait faire quand on appuie dessus. */
export interface PickAction {
  /** Appareil auquel la pièce appartient (systems/devices). */
  id: string;
  kind:
    /** Vitrine d'un distributeur : la case sous le réticule est l'article. */
    | 'vendSlot'
    /** Fente à monnaie / avaleur de billets. */
    | 'coinSlot'
    | 'billSlot'
    /** Lecteur sans contact d'une machine. */
    | 'icPad'
    /** Levier de rendu de monnaie. */
    | 'lever'
    /** Volet du 取出口, ou fente de sortie des billets. */
    | 'tray'
    /** Écran tactile d'un 券売機 : la case sous le réticule est le choix. */
    | 'screen'
    /** Lecteur d'un portillon. */
    | 'gate'
    /** Bac de tri. */
    | 'bin';
  /** Trame d'une surface découpée : colonnes × rangées, lues en UV. */
  cols?: number;
  rows?: number;
  /** Sens de franchissement, pour un portillon. */
  dir?: 1 | -1;
  /** Rang du poste, pour une batterie de 券売機. */
  post?: number;
}

export interface PickHit {
  act: PickAction;
  /** Case touchée sur une surface découpée, ou -1. */
  cell: number;
  dist: number;
}

/**
 * Portée du geste : la longueur d'un bras plus le pas qu'on fait sans y penser.
 *
 * Plus court, il fallait se coller à la tôle ; plus long, on appuyait sur un
 * bouton en passant devant sans s'arrêter.
 */
const REACH = 1.5;

const pickables = new Set<THREE.Object3D>();

/** Inscrit une pièce et son action. Rend la fonction qui la retire. */
export function addPickable(obj: THREE.Object3D, act: PickAction): () => void {
  obj.userData.act = act;
  pickables.add(obj);
  return () => {
    pickables.delete(obj);
    delete obj.userData.act;
  };
}

/** La pièce sous le réticule, ou null. Sondée dix fois par seconde. */
export const pick: { hit: PickHit | null } = { hit: null };

const raycaster = new THREE.Raycaster();
const dir = new THREE.Vector3();
let camera: THREE.Camera | null = null;

/** La caméra depuis laquelle on vise. Posée par le rendu (three/Engine). */
export function setPickCamera(c: THREE.Camera | null): void {
  camera = c;
}

let pollT = 0;

export function updatePick(dt: number): void {
  pollT -= dt;
  if (pollT > 0) return;
  pollT = 0.1;
  pick.hit = castPick();
}

function castPick(): PickHit | null {
  if (!camera || pickables.size === 0) return null;
  camera.getWorldDirection(dir);
  raycaster.set(camera.getWorldPosition(new THREE.Vector3()), dir);
  raycaster.far = REACH;
  raycaster.near = 0;
  const hits = raycaster.intersectObjects([...pickables], false);
  for (const h of hits) {
    const act = h.object.userData.act as PickAction | undefined;
    if (!act) continue;
    let cell = -1;
    if (act.cols && act.rows && h.uv) {
      // L'origine UV d'un plan est en bas à gauche, celle d'un canevas en haut
      // à gauche : la rangée se lit donc à l'envers de la coordonnée v.
      const col = Math.min(act.cols - 1, Math.max(0, Math.floor(h.uv.x * act.cols)));
      const row = Math.min(act.rows - 1, Math.max(0, Math.floor((1 - h.uv.y) * act.rows)));
      cell = row * act.cols + col;
    }
    return { act, cell, dist: h.distance };
  }
  return null;
}

/** Vide le registre : changement de gare, démontage de la scène. */
export function resetPick(): void {
  pickables.clear();
  pick.hit = null;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Sonde : ce qui répond dans la scène, EN REPÈRE MONDE - le seul dans lequel
  // on puisse aller marcher (__probeGo) et poser le regard (__lookAt).
  const w = window as unknown as Record<string, unknown>;
  w.__pickables = () =>
    [...pickables].map((o) => {
      const p = o.getWorldPosition(new THREE.Vector3());
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
      return {
        act: o.userData.act as PickAction,
        at: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
        // Un pas devant la pièce : c'est là qu'il faut se tenir pour l'atteindre.
        stand: [+(p.x + n.x * 0.8).toFixed(2), +(p.z + n.z * 0.8).toFixed(2)],
      };
    });
  // La surface d'une pièce, telle qu'elle est réellement peinte. Une dalle
  // tactile est un canevas : quand elle ne montre pas ce qu'on croit, c'est le
  // canevas qu'il faut regarder, pas la capture d'écran de trois quarts.
  w.__dumpSurface = (id: string, kind: string) => {
    for (const o of pickables) {
      const act = o.userData.act as PickAction | undefined;
      if (act?.id !== id || act.kind !== kind) continue;
      const mat = (o as THREE.Mesh).material as THREE.MeshBasicMaterial;
      const img = mat.map?.image as HTMLCanvasElement | undefined;
      return img?.toDataURL?.() ?? null;
    }
    return null;
  };
}
