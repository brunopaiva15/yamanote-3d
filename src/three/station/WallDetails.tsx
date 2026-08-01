// Ce qui saille, court et pend sur un mur de gare.
//
// La texture (textures/stationWall) donne au mur ses défauts de SURFACE : les
// reprises, les coulures, les fissures, le pied sale. Elle ne peut rien donner
// de plus - un mur reste un plan, et un plan reste lisse quel que soit ce qu'on
// peint dessus. Or ce qui fait qu'un mur de gare accroche l'œil de loin, ce
// n'est pas son grain : c'est le relief qui s'y accroche, et qui projette de
// vraies ombres à chaque heure du jour.
//
// D'OÙ CE FICHIER. Cinq choses, et seulement celles-là, parce que ce sont
// celles qu'on voit sur toutes les photos de quai de la boucle :
//
//   • le couvre-joint vertical, tous les 4,80 m - la trame du mur ;
//   • le larmier, filet horizontal qui coupe la hauteur en deux ;
//   • la descente d'eau, tous les 26 m, avec ses colliers et son dauphin ;
//   • le coffret technique, tous les 34 m ;
//   • le coffret d'incendie, tous les 41 m - et c'est le seul rouge du décor.
//
// Les pas sont PREMIERS ENTRE EUX à dessein : sur deux cent vingt mètres, trois
// objets qui reviennent tous les 26, 34 et 41 mètres ne se superposent jamais
// deux fois de la même façon, et le mur cesse de se répéter à l'œil.
//
// TOUT EST INSTANCIÉ. Cinq appels de rendu pour un mur de 224 m, quel que soit
// le nombre d'exemplaires - la même règle que le reste du quai.
//
// LE PLACAGE. Le mur est un plan d'abscisse constante. `faceX` est le nu vu, et
// `dir` le sens dans lequel on s'en éloigne (-1 quand on regarde le mur depuis
// un x plus petit, ce qui est le cas partout sur la boucle). Rien ne dépasse de
// plus de dix centimètres : au-delà, la trousse de quai et la marche du joueur
// commenceraient à se marcher dessus.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { Mats } from './materials';
import { mat, useInstances } from './instancing';

/** Entraxe des couvre-joints verticaux (m). */
const JOINT_PITCH = 4.8;
/** Entraxe des descentes d'eau (m). */
const PIPE_PITCH = 26;
/** Entraxe des coffrets techniques (m). */
const CABINET_PITCH = 34;
/** Entraxe des coffrets d'incendie (m). */
const HYDRANT_PITCH = 41;
/** Hauteur du larmier au-dessus du sol (m). */
const DRIP_Y = 2.62;

/** Référence stable pour un mur que rien n'occupe : celui d'en face. */
const NO_OBSTACLES: readonly WallObstacle[] = [];

/** Emprise au sol d'un ouvrage du quai, dans le repère du quai. */
export type WallObstacle = { x: number; z: number; halfX: number; halfZ: number };

/** Positions régulières sur la longueur, centrées, avec leur décalage propre. */
function spread(len: number, pitch: number, phase: number): number[] {
  const out: number[] = [];
  const half = len / 2;
  const first = -half + ((phase % pitch) + pitch) % pitch;
  for (let z = first; z <= half; z += pitch) out.push(z);
  return out;
}

/**
 * Écarte les positions où le mur est DÉJÀ occupé.
 *
 * Sur un quai latéral, le mur de fond porte le mobilier de quai : armoires,
 * distributeurs, caissons publicitaires. Le placement (systems/stationPlacement)
 * les répartit dans ce que la gare laisse libre, à des abscisses qui changent
 * d'une gare à l'autre - impossible, donc, de décaler la trame d'ici une fois
 * pour toutes. On lit ses emprises et on saute les pas qui tombent dedans : un
 * coffret d'incendie de moins vaut mieux qu'un coffret planté dans une armoire.
 *
 * Seuls comptent les ouvrages qui viennent VRAIMENT au mur : un banc adossé à
 * quatre-vingts centimètres n'a jamais gêné une descente d'eau.
 */
function clearOf(
  zs: number[],
  obstacles: readonly WallObstacle[],
  faceX: number,
  dir: -1 | 1,
  halfZ: number,
): number[] {
  if (!obstacles.length) return zs;
  const near = obstacles.filter((o) =>
    dir < 0 ? o.x + o.halfX > faceX - 0.3 : o.x - o.halfX < faceX + 0.3,
  );
  if (!near.length) return zs;
  return zs.filter((z) => !near.some((o) => Math.abs(z - o.z) < o.halfZ + halfZ + 0.12));
}

export function WallDetails({
  faceX,
  dir,
  y0,
  h,
  len,
  m,
  detail,
  /**
   * Hauteur du soubassement, LISERÉ COMPRIS : rien ne se pose en dessous.
   *
   * La faïence monte à 1,04 m et le liseré qui la couronne dépasse à 1,105 -
   * d'où 1,14, qui les laisse tous les deux dessous. C'est aussi ce qu'on voit
   * sur un vrai quai : coffrets et couvre-joints commencent au-dessus du
   * carrelage, jamais à cheval dessus.
   */
  dadoTop = 1.14,
  obstacles = NO_OBSTACLES,
}: {
  /** Abscisse du nu vu du mur. */
  faceX: number;
  /** Sens dans lequel on s'éloigne du mur : -1 vers le quai, +1 à l'opposé. */
  dir: -1 | 1;
  /** Altitude du pied du mur. */
  y0: number;
  /** Hauteur du mur. */
  h: number;
  /** Longueur du mur. */
  len: number;
  m: Mats;
  /** Palier de qualité : 0 = tout, 3 = le strict nécessaire. */
  detail: number;
  dadoTop?: number;
  /** Ce que le quai a déjà posé contre ce mur, et qu'on ne double pas. */
  obstacles?: readonly WallObstacle[];
}) {
  // Un mur trop bas n'a ni larmier ni descente : ce qu'on y accrocherait
  // sortirait par le haut. C'est le cas des garde-corps de viaduc.
  const tall = h >= 2.9;

  // Le couvre-joint ne sort que de quatre centimètres - moins que le
  // soubassement qu'il surmonte : rien ne peut le heurter, et il garde donc sa
  // trame entière, celle qui donne l'échelle du mur. Il lui faut quand même de
  // quoi exister au-dessus du carrelage.
  const jointH = h - dadoTop - 0.12;
  const jointZs = useMemo(
    () => (jointH > 0.5 ? spread(len, JOINT_PITCH, 0) : []),
    [len, jointH],
  );
  const pipeZs = useMemo(
    () => (tall ? clearOf(spread(len, PIPE_PITCH, 7.3), obstacles, faceX, dir, 0.14) : []),
    [len, tall, obstacles, faceX, dir],
  );
  const cabinetZs = useMemo(
    () =>
      tall && detail <= 1
        ? clearOf(spread(len, CABINET_PITCH, 12.5), obstacles, faceX, dir, 0.22)
        : [],
    [len, tall, detail, obstacles, faceX, dir],
  );
  const hydrantZs = useMemo(
    () =>
      tall && detail <= 1
        ? clearOf(spread(len, HYDRANT_PITCH, 20.8), obstacles, faceX, dir, 0.26)
        : [],
    [len, tall, detail, obstacles, faceX, dir],
  );

  // Couvre-joint : un plat vissé sur le joint de dilatation, du soubassement
  // jusqu'au couronnement. C'est l'ombre qu'il porte qui se voit, pas son
  // épaisseur - d'où quatre centimètres, et pas davantage.
  const joints = useMemo(
    () =>
      jointZs.map((z) =>
        mat(faceX + dir * 0.02, y0 + dadoTop + jointH / 2, z, 0.04, jointH, 0.11),
      ),
    [jointZs, faceX, dir, y0, dadoTop, jointH],
  );
  const jointRef = useRef<THREE.InstancedMesh>(null);
  useInstances(jointRef, joints);

  // Descente d'eau : le fût, deux colliers, et le dauphin qui rend au sol.
  //
  // Elle descend JUSQU'EN BAS, par-devant le soubassement - c'est ce que fait
  // une descente d'eau, et la couper au-dessus du carrelage donnait un tube
  // suspendu au milieu du mur. Elle se tient donc au large du nu carrelé, sur
  // ses colliers : douze centimètres, l'écart réel d'une descente sur console.
  const pipeBottom = y0 + 0.34;
  const pipeTop = y0 + h - 0.35;
  const pipeH = Math.max(0.5, pipeTop - pipeBottom);
  const pipes = useMemo(
    () => pipeZs.map((z) => mat(faceX + dir * 0.115, (pipeBottom + pipeTop) / 2, z, 1, pipeH, 1)),
    [pipeZs, faceX, dir, pipeBottom, pipeTop, pipeH],
  );
  const pipeRef = useRef<THREE.InstancedMesh>(null);
  useInstances(pipeRef, pipes);

  const collars = useMemo(
    () =>
      pipeZs.flatMap((z) =>
        // Le collier CEINTURE le fût et retourne au mur : plus large que la
        // descente, donc, et centré sur elle. Aligné sur le nu du mur, il ne
        // tenait rien - le tube passait devant. Les deux sont HAUT, au-dessus
        // du soubassement, là où le collier a du mur plat où se visser.
        [0.42, 0.78].map((t) =>
          mat(faceX + dir * 0.09, pipeBottom + pipeH * t, z, 0.23, 0.055, 0.15),
        ),
      ),
    [pipeZs, faceX, dir, pipeBottom, pipeH],
  );
  const collarRef = useRef<THREE.InstancedMesh>(null);
  useInstances(collarRef, collars);

  const shoes = useMemo(
    () => pipeZs.map((z) => mat(faceX + dir * 0.115, y0 + 0.17, z, 0.12, 0.34, 0.14)),
    [pipeZs, faceX, dir, y0],
  );
  const shoeRef = useRef<THREE.InstancedMesh>(null);
  useInstances(shoeRef, shoes);

  // Coffrets : la caisse, puis sa porte légèrement en avant pour qu'un joint
  // d'ombre l'en détache. Deux boîtes chacun, et deux appels de rendu en tout.
  const cabinetY = y0 + dadoTop + 0.52;
  const cabinets = useMemo(
    () => cabinetZs.map((z) => mat(faceX + dir * 0.05, cabinetY, z, 0.1, 0.62, 0.44)),
    [cabinetZs, faceX, dir, cabinetY],
  );
  const cabinetRef = useRef<THREE.InstancedMesh>(null);
  useInstances(cabinetRef, cabinets);

  const cabinetDoors = useMemo(
    () => cabinetZs.map((z) => mat(faceX + dir * 0.098, cabinetY, z, 0.02, 0.54, 0.36)),
    [cabinetZs, faceX, dir, cabinetY],
  );
  const cabinetDoorRef = useRef<THREE.InstancedMesh>(null);
  useInstances(cabinetDoorRef, cabinetDoors);

  // Le coffret d'incendie POSE sur le soubassement, il ne le chevauche pas :
  // à 1,34 m d'axe, son quart bas mordait dans la faïence et dans le liseré
  // qui la couronne, sur les trente gares à la fois.
  const hydrants = useMemo(
    () => hydrantZs.map((z) => mat(faceX + dir * 0.06, y0 + dadoTop + 0.45, z, 0.12, 0.78, 0.52)),
    [hydrantZs, faceX, dir, y0, dadoTop],
  );
  const hydrantRef = useRef<THREE.InstancedMesh>(null);
  useInstances(hydrantRef, hydrants);

  return (
    <group name="détails-mur">
      <instancedMesh
        name="couvre-joint"
        ref={jointRef}
        args={[undefined, undefined, Math.max(1, joints.length)]}
        material={m.wallDark}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Larmier : le filet qui court à hauteur de linteau. Il coupe une
          hauteur nue en deux et il arrête les coulures - c'est exactement ce
          qu'il fait sur un vrai mur, et la texture le montre en dessous. */}
      {tall && (
        <mesh position={[faceX + dir * 0.035, y0 + DRIP_Y, 0]} material={m.wallDark}>
          <boxGeometry args={[0.07, 0.09, len]} />
        </mesh>
      )}

      <instancedMesh
        name="descente-eau-mur"
        ref={pipeRef}
        args={[undefined, undefined, Math.max(1, pipes.length)]}
        material={m.metal}
      >
        <cylinderGeometry args={[0.058, 0.058, 1, 8]} />
      </instancedMesh>
      <instancedMesh
        name="collier"
        ref={collarRef}
        args={[undefined, undefined, Math.max(1, collars.length)]}
        material={m.frame}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        name="dauphin"
        ref={shoeRef}
        args={[undefined, undefined, Math.max(1, shoes.length)]}
        material={m.wallDark}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      <instancedMesh
        name="coffret-technique"
        ref={cabinetRef}
        args={[undefined, undefined, Math.max(1, cabinets.length)]}
        material={m.frame}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        name="porte-coffret"
        ref={cabinetDoorRef}
        args={[undefined, undefined, Math.max(1, cabinetDoors.length)]}
        material={m.metal}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        name="coffret-incendie"
        ref={hydrantRef}
        args={[undefined, undefined, Math.max(1, hydrants.length)]}
        material={m.hydrant}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    </group>
  );
}
