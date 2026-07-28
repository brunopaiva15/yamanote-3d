// Signalétique du quai : panneaux de nom de gare suspendus, tableau
// d'affichage électronique, totems, et la grande bande verte directionnelle.
//
// Le panneau de nom n'a pas changé : c'est la même texture et le même redraw
// qu'avant, seulement répartis sur un quai de plus de deux cents mètres.
//
// Le tableau d'affichage, lui, a changé du tout au tout. Il annonçait
// « まもなく発車 » en permanence, y compris en pleine voie entre deux gares où
// aucun train ne longe le quai. Un afficheur de quai dit ce qui se passe
// MAINTENANT, et c'est la seule surface animée d'une gare japonaise : il suit
// donc l'état réel — approche, embarquement, départ, attente — et alterne
// japonais et anglais comme un vrai. Le canvas est redessiné quand l'état
// affiché change, pas à chaque frame : une fois par seconde environ.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { runtime } from '../../systems/runtime';
import { platformWait } from '../../systems/platformWait';
import {
  makeDirectionBand,
  makePlatformBoard,
  makeStationSign,
  type BoardView,
} from '../../textures/procedural';
import { PLATFORM_TOP } from '../../data/stationGeometry';

interface Props {
  /** Abscisse de suspension des caissons (repère quai). */
  hangX: number;
  /** Hauteur de la sous-face de l'auvent. */
  canopyY: number;
  /** Demi-longueur du quai. */
  halfZ: number;
  /** Abscisse des totems posés au sol. */
  totemX: number;
  /** Abscisse de l'épine : la bande directionnelle est suspendue au-dessus. */
  bandX: number;
  /** Palier de qualité : 0 = tout, 3 = le strict nécessaire. */
  detail: number;
  /** Ce qui est déjà posé au sol près de l'épine : les totems s'en écartent. */
  ground: { z: number; halfZ: number }[];
  frame: THREE.Material;
  metal: THREE.Material;
  accent: THREE.Material;
}

/** Intervalle réel entre deux rames, en secondes (cf. platformWait). */
const HEADWAY = 60;
/** Cadence d'alternance japonais / anglais de l'afficheur (s). */
const CYCLE = 3.5;

/**
 * Ce que le tableau doit afficher, à cet instant.
 *
 * Deux sources selon l'endroit d'où l'on regarde : debout sur le quai, c'est
 * `platformWait` qui mène la danse ; à bord, c'est la phase du cycle station.
 * Les deux disent la même chose de la même rame, vue de deux côtés.
 */
function boardView(t: number): BoardView {
  const english = Math.floor(t / CYCLE) % 2 === 1;
  if (runtime.playerFrame === 'platform') {
    const { stage } = platformWait;
    if (stage === 'departing') {
      return { status: 'departing', minutes: 0, english, blink: Math.floor(t * 2) % 2 === 0 };
    }
    if (stage === 'clear') {
      const left = Math.max(0, HEADWAY - platformWait.t);
      return { status: 'waiting', minutes: Math.max(1, Math.ceil(left / 60)), english, blink: false };
    }
    if (stage === 'approaching' || stage === 'berthing') {
      return { status: 'approaching', minutes: 0, english, blink: false };
    }
    return { status: 'boarding', minutes: 0, english, blink: false };
  }
  const { phase } = useStore.getState();
  if (phase === 'brake') return { status: 'approaching', minutes: 0, english, blink: false };
  if (phase === 'depart') {
    return { status: 'departing', minutes: 0, english, blink: Math.floor(t * 2) % 2 === 0 };
  }
  if (phase === 'dwell') return { status: 'boarding', minutes: 0, english, blink: false };
  return { status: 'waiting', minutes: 2, english, blink: false };
}

/** Deux vues sont-elles assez différentes pour mériter un redessin ? */
function sameView(a: BoardView, b: BoardView): boolean {
  return (
    a.status === b.status &&
    a.minutes === b.minutes &&
    a.english === b.english &&
    a.blink === b.blink
  );
}

export function PlatformSignage({
  hangX,
  canopyY,
  halfZ,
  totemX,
  bandX,
  detail,
  ground,
  frame,
  metal,
  accent,
}: Props) {
  const sign = useMemo(() => makeStationSign(), []);
  const board = useMemo(() => makePlatformBoard(), []);
  const band = useMemo(() => makeDirectionBand(), []);
  const lastSignIndex = useRef(-1);
  const lastView = useRef<BoardView | null>(null);
  const clock = useRef(0);

  const materials = useMemo(
    () => ({
      sign: new THREE.MeshBasicMaterial({
        map: sign.texture,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
      board: new THREE.MeshBasicMaterial({
        map: board.texture,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
      band: new THREE.MeshBasicMaterial({
        map: band.texture,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    }),
    [sign, board, band],
  );

  // Un panneau de nom de gare tous les ~55 m, un tableau d'affichage tous les
  // ~110 m : sur un quai de 224 m, un seul de chaque serait introuvable.
  const signZ = useMemo(() => {
    const out: number[] = [];
    for (let z = -halfZ + 26; z <= halfZ - 26; z += 55) out.push(z);
    return out;
  }, [halfZ]);
  const boardZ = useMemo(() => [-halfZ * 0.45, halfZ * 0.45], [halfZ]);
  // Les totems se posaient à des z fixes, sans consulter le mobilier : ils
  // tombaient dans un distributeur une fois sur dix. Ils s'écartent de tout ce
  // qui est déjà au sol autour de l'épine — en cherchant des DEUX côtés : la
  // dérive à sens unique pouvait chasser un totem d'obstacle en obstacle sans
  // jamais trouver de creux, et le laisser planté dans le dernier.
  const totemZ = useMemo(
    () =>
      [-halfZ * 0.66, 0, halfZ * 0.66].flatMap((base) => {
        for (let d = 0; d <= 7.7; d += 1.1) {
          for (const s of d === 0 ? [0] : [-d, d]) {
            const z = base + s;
            if (!ground.some((o) => Math.abs(o.z - z) < o.halfZ + 0.9)) return [z];
          }
        }
        // Pas de creux à portée : mieux vaut un totem de moins qu'un totem
        // dans un escalier.
        return [];
      }),
    [halfZ, ground],
  );
  // La bande directionnelle est suspendue à l'auvent, au-dessus de l'épine.
  // Ses trois tronçons se posent dans les CREUX de la trame des bannières
  // publicitaires (une tous les 26 m, à partir de -halfZ + 18) : d'un seul
  // tenant, ou calée n'importe où, elle les aurait traversées — et elle passe
  // aussi au large des trémies et des escaliers mécaniques.
  const bandZ = useMemo(() => [-halfZ + 31, -halfZ + 109, -halfZ + 161], [halfZ]);

  useFrame((_, dt) => {
    if (runtime.platformFade <= 0.03) return;
    clock.current += dt;
    const { index, phase } = useStore.getState();
    // Pendant depart l'index a déjà avancé : panneau = gare quittée (index-1).
    const signIndex = phase === 'depart' ? (index + 29) % 30 : index;
    if (
      (phase === 'brake' || phase === 'dwell' || phase === 'depart') &&
      lastSignIndex.current !== signIndex
    ) {
      lastSignIndex.current = signIndex;
      sign.redraw(signIndex);
      band.redraw(signIndex);
      lastView.current = null;
    }
    // L'afficheur ne se redessine que lorsqu'il a réellement changé : sinon on
    // repeindrait un canvas de 1024 × 256 soixante fois par seconde pour rien.
    const view = boardView(clock.current);
    if (!lastView.current || !sameView(lastView.current, view)) {
      lastView.current = view;
      board.redraw(signIndex, view);
    }
  });

  const signY = canopyY - 0.77;
  const boardY = canopyY - 0.39;
  // Hauteur libre entre le haut d'un caisson et la sous-face de l'auvent : les
  // suspentes se calculaient à longueur fixe et ressortaient sur le toit.
  const bandHang = Math.max(0.06, 0.5 - 0.31);
  const boardHang = Math.max(0.06, canopyY - (boardY + 0.18));

  return (
    <group name="signalétique">
      {/* Panneaux JR suspendus, lisibles depuis le wagon comme depuis le quai */}
      {signZ.map((z) => (
        <group name="panneau-nom" key={`sign${z}`} position={[hangX, signY, z]}>
          {[-1.1, 1.1].map((dz) => {
            // Du haut du caisson à la sous-face de l'auvent, ni plus ni moins.
            const h = Math.max(0.06, canopyY - (signY + 0.5));
            return (
              <mesh key={`hang${dz}`} position={[0.06, 0.5 + h / 2, dz]} material={frame}>
                <boxGeometry args={[0.045, h, 0.07]} />
              </mesh>
            );
          })}
          {/* Caisson noir derrière la face éclairée */}
          <mesh position={[0.055, 0, 0]} material={frame}>
            <boxGeometry args={[0.1, 1.0, 3.35]} />
          </mesh>
          <mesh position={[-0.01, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={materials.sign}>
            <planeGeometry args={[3.2, 0.96]} />
          </mesh>
        </group>
      ))}

      {/* Tableaux d'affichage suspendus */}
      {boardZ.map((z) => (
        <group name="afficheur" key={`board${z}`} position={[hangX - 0.1, boardY, z]}>
          <mesh position={[0.08, 0.15, 0]} material={metal}>
            <boxGeometry args={[0.5, 0.06, 3.4]} />
          </mesh>
          <mesh position={[0.05, -0.28, 0]} material={metal}>
            <boxGeometry args={[0.08, 0.88, 3.3]} />
          </mesh>
          <mesh
            position={[-0.02, -0.28, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            material={materials.board}
          >
            <planeGeometry args={[3.2, 0.8]} />
          </mesh>
          {[-1.4, 1.4].map((dz) => (
            <mesh key={`hang${dz}`} position={[0.08, 0.18 + boardHang / 2, dz]} material={metal}>
              <boxGeometry args={[0.04, boardHang, 0.04]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Grande bande verte directionnelle, suspendue au-dessus de l'épine.
          C'est l'élément le plus long et le plus lisible d'un quai japonais :
          une flèche, les gares desservies, et rien d'autre. Recto-verso,
          puisqu'un îlot a un bord d'embarquement de chaque côté. */}
      {detail <= 2 && bandZ.map((z) => (
        <group name="bande-directionnelle" key={`band${z}`} position={[bandX, canopyY - 0.5, z]}>
          <mesh material={frame}>
            <boxGeometry args={[0.12, 0.62, 8.2]} />
          </mesh>
          {[-1, 1].map((d) => (
            <mesh
              key={d}
              position={[d * 0.065, 0, 0]}
              rotation={[0, d === -1 ? -Math.PI / 2 : Math.PI / 2, 0]}
              material={materials.band}
            >
              <planeGeometry args={[8, 0.56]} />
            </mesh>
          ))}
          {/* Suspentes jusqu'à la sous-face de l'auvent, et pas au-delà : à
              longueur fixe, elles la traversaient et ressortaient sur le toit. */}
          {[-3.4, 3.4].map((dz) => (
            <mesh key={dz} position={[0, 0.31 + bandHang / 2, dz]} material={metal}>
              <boxGeometry args={[0.05, bandHang, 0.05]} />
            </mesh>
          ))}
        </group>
      ))}


      {/* Totems d'information */}
      {totemZ.map((z) => (
        <group name="totem" key={`totem${z}`} position={[totemX, PLATFORM_TOP, z]}>
          <mesh position={[0, 1.1, 0]} material={metal}>
            <boxGeometry args={[0.22, 2.2, 0.35]} />
          </mesh>
          <mesh
            position={[-0.12, 1.55, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            material={materials.sign}
          >
            <planeGeometry args={[0.3, 0.9]} />
          </mesh>
          <mesh position={[0, 2.35, 0]} material={accent}>
            <boxGeometry args={[0.28, 0.12, 0.4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
