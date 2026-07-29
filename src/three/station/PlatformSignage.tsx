// Signalétique du quai : panneaux de nom de gare suspendus, 発車標, totems, et
// la grande bande verte directionnelle.
//
// Le panneau de nom n'a pas changé : c'est la même texture et le même redraw
// qu'avant, seulement répartis sur un quai de plus de deux cents mètres.
//
// Le 発車標, lui, dit ce qui se passe MAINTENANT — c'est la seule surface
// animée d'une gare japonaise. Il annonce les deux prochaines rames et le
// temps qui les sépare de nous (data/departureBoard), en alternant japonais et
// anglais comme un vrai. Le canvas est redessiné quand l'état affiché change,
// pas à chaque frame : une fois par seconde environ.
//
// Il a aussi changé de RANGÉE. Il pendait à côté des panneaux de nom, à dix
// centimètres d'eux et tourné comme eux vers la voie : il se lisait donc
// depuis le train, et de nulle part ailleurs. Or c'est le tableau de ceux qui
// ATTENDENT. Il est passé dans la rangée du bord de voie, celle des caissons
// 番線 : suspendu près du bord, en travers, recto-verso, aligné sur eux par le
// bas — on l'a de face en marchant le long du quai, dans un sens comme dans
// l'autre.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { runtime } from '../../systems/runtime';
import { nextTrainsFromPlatform } from '../../systems/platformWait';
import {
  makeDirectionBand,
  makePlatformBoard,
  makeStationSign,
  makeTotemGuide,
  makeTotemSign,
} from '../../textures/procedural';
import {
  boardRows,
  sameBoardView,
  type BoardView,
  type NextTrains,
} from '../../data/departureBoard';
import { CONFIG } from '../../data/config';
import { cruiseDuration, journeyDuration } from '../../data/segments';
import { dwellDuration, melodyStartAt } from '../../systems/stationCycle';
import {
  directionBandZs,
  nameplateColumns,
  PLATFORM_TOP,
  SIGN_BOTTOM,
} from '../../data/stationGeometry';
import {
  departureBoardZs,
  trackSignBox,
  type StationPlacement,
} from '../../systems/stationPlacement';

interface Props {
  /**
   * Le placement de la gare : le 発車標 y lit la rangée du bord de voie qu'il
   * partage avec les caissons 番線 (emprise en travers et creux libres).
   */
  place: StationPlacement;
  /** Abscisse de suspension des caissons (repère quai). */
  hangX: number;
  /** Hauteur de la sous-face de l'auvent. */
  canopyY: number;
  /** Demi-longueur du quai. */
  halfZ: number;
  /** Abscisse des totems posés au sol. */
  totemX: number;
  /**
   * Face des poteaux de charpente tournée vers la voie : c'est là que se
   * vissent les plaques de nom de gare (柱型駅名標 — littéralement la plaque
   * DU poteau).
   */
  postFaceX: number;
  /** Abscisses des poteaux de charpente, le long du quai. */
  columns: readonly number[];
  /** Abscisse de l'épine : la bande directionnelle est suspendue au-dessus. */
  bandX: number;
  /** Palier de qualité : 0 = tout, 3 = le strict nécessaire. */
  detail: number;
  /** Ce qui est déjà posé au sol près de l'épine : les totems s'en écartent. */
  ground: { z: number; halfZ: number }[];
  /**
   * Plans de charpente signature : les caissons suspendus (nom de gare,
   * afficheurs) se décalent pour ne pas les traverser.
   */
  avoid: { z: number; r: number }[];
  frame: THREE.Material;
  metal: THREE.Material;
  accent: THREE.Material;
}

/**
 * Décale `z` hors des plans à éviter, en cherchant des deux côtés ; null si
 * aucun creux à portée — le caisson saute plutôt que de transpercer un
 * portique. `halfZ` est la demi-longueur du caisson à caser.
 */
function clearOf(
  z: number,
  halfZ: number,
  avoid: { z: number; r: number }[],
): number | null {
  // La portée est large : les passerelles de Takanawa imposent plus de cinq
  // mètres de décalage à un tableau, et un tableau déplacé vaut mieux qu'un
  // tableau en moins.
  for (let d = 0; d <= 7.3; d += 0.9) {
    for (const s of d === 0 ? [0] : [-d, d]) {
      const cand = z + s;
      if (!avoid.some((a) => Math.abs(cand - a.z) < a.r + halfZ)) return cand;
    }
  }
  return null;
}

/** Cadence d'alternance japonais / anglais de l'afficheur (s). */
const CYCLE = 3.5;

/**
 * Ce que le quai voit venir, depuis le train.
 *
 * À bord, la rame qui intéresse le tableau est CELLE OÙ L'ON EST : elle
 * s'annonce d'elle-même pendant le freinage, occupe le quai pendant l'arrêt,
 * puis le libère. La suivante vient un intervalle plus tard — l'intervalle du
 * tronçon, dont la croisière est justement dimensionnée (data/segments).
 */
function nextTrainsFromCar(index: number): NextTrains {
  const { phase } = useStore.getState();
  const t = runtime.phaseT;
  const dwell = dwellDuration(index);
  /** D'une rame à quai à la suivante à quai : l'intervalle réel du tronçon. */
  const cycle = journeyDuration(index) + CONFIG.dwellTime;
  switch (phase) {
    case 'brake': {
      const first = Math.max(0, CONFIG.brakeTime - t);
      return { first, second: first + cycle, leaving: false };
    }
    case 'dwell':
      // La 発車メロディ est le signal de départ : c'est à elle, et non à la
      // fermeture des portes, que le tableau passe en 「まもなく発車」.
      return {
        first: null,
        second: Math.max(60, cycle - t),
        leaving: t >= melodyStartAt(index, dwell),
      };
    case 'depart':
      return { first: null, second: Math.max(60, cycle - dwell - t), leaving: true };
    default: {
      const first = Math.max(0, cruiseDuration(index) - t) + CONFIG.brakeTime;
      return { first, second: first + cycle, leaving: false };
    }
  }
}

/**
 * Ce que le tableau doit afficher, à cet instant.
 *
 * Deux sources selon l'endroit d'où l'on regarde : debout sur le quai, c'est
 * `platformWait` qui mène la danse ; à bord, c'est la phase du cycle station.
 * Les deux disent la même chose de la même rame, vue de deux côtés — et la
 * mise en forme (約N分後, まもなく, ou l'heure aux premières et dernières
 * circulations) est la même pour les deux : data/departureBoard.
 */
function boardView(t: number, index: number): BoardView {
  const english = Math.floor(t / CYCLE) % 2 === 1;
  const next =
    runtime.playerFrame === 'platform' ? nextTrainsFromPlatform(index) : nextTrainsFromCar(index);
  return {
    rows: boardRows(next, runtime.clockMin),
    english,
    // Le tableau ne bat que sur la FERMETURE : 「まもなく発車」 s'affiche dès la
    // mélodie, mais une ligne qui clignote une demi-minute durant ne se lit
    // plus. Les vantaux sont le signal, d'où qu'on regarde.
    blink: next.leaving && runtime.doorTarget === 0 && Math.floor(t * 2) % 2 === 0,
  };
}

export function PlatformSignage({
  place,
  hangX,
  canopyY,
  halfZ,
  totemX,
  postFaceX,
  columns,
  bandX,
  detail,
  ground,
  avoid,
  frame,
  metal,
  accent,
}: Props) {
  const sign = useMemo(() => makeStationSign(), []);
  // Le totem a sa propre texture : une plaque de poteau est cinq fois plus
  // haute que large, le caisson suspendu trois fois plus large que haut, et
  // les deux ne portent pas la même chose — kana vertical sur l'une, kanji et
  // bande directionnelle sur l'autre. La même image sur les deux se déformait
  // d'un facteur dix.
  const totem = useMemo(() => makeTotemSign(), []);
  // Ce que porte le totem lui-même, maintenant que la plaque de nom est
  // remontée sur les poteaux : l'orientation.
  const guide = useMemo(() => makeTotemGuide(), []);
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
      totem: new THREE.MeshBasicMaterial({
        map: totem.texture,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
      guide: new THREE.MeshBasicMaterial({
        map: guide.texture,
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
    [sign, totem, guide, board, band],
  );

  // Un panneau de nom de gare tous les ~55 m : sur un quai de 224 m, un seul
  // serait introuvable. Il se décale des plans de charpente signature — les
  // portiques de Yūrakuchō lui passaient au travers.
  const signZ = useMemo(() => {
    const out: number[] = [];
    for (let z = -halfZ + 26; z <= halfZ - 26; z += 55) {
      const clear = clearOf(z, 1.8, avoid);
      if (clear !== null) out.push(clear);
    }
    return out;
  }, [halfZ, avoid]);
  // Deux 発車標 par quai, dans les creux de la rangée du bord de voie : c'est
  // le placement qui les y case, entre les caissons 番線 et hors des potences
  // dont la traverse passe juste au-dessus d'eux.
  const boardZ = useMemo(() => departureBoardZs(place), [place]);
  const boardBox = useMemo(() => trackSignBox(place), [place]);
  // Les plaques de nom se vissent sur les poteaux de charpente, un sur deux.
  // La liste est partagée avec les bandeaux publicitaires (stationGeometry) :
  // une face de poteau ne porte qu'une chose.
  const plateZ = useMemo(() => nameplateColumns(columns), [columns]);
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
  // Abscisses partagées (data/stationGeometry) : les charpentes signature qui
  // plantent des poteaux sur l'épine enjambent ces trois tronçons.
  const bandZ = useMemo(() => directionBandZs(halfZ * 2), [halfZ]);

  useFrame((_, dt) => {
    if (runtime.platformFade <= 0.03) return;
    clock.current += dt;
    // La gare du panneau est celle du quai présent : pendant le départ, index
    // a déjà avancé mais platformIndex retient la gare quittée, quel que soit
    // le sens de la boucle.
    const { platformIndex: signIndex, phase } = useStore.getState();
    if (
      (phase === 'brake' || phase === 'dwell' || phase === 'depart') &&
      lastSignIndex.current !== signIndex
    ) {
      lastSignIndex.current = signIndex;
      sign.redraw(signIndex);
      totem.redraw(signIndex);
      guide.redraw(signIndex);
      band.redraw(signIndex);
      lastView.current = null;
    }
    // L'afficheur ne se redessine que lorsqu'il a réellement changé : sinon on
    // repeindrait un canvas de 1024 × 256 soixante fois par seconde pour rien.
    // Le tableau est celui du quai qu'on longe, et non de la gare visée : c'est
    // `signIndex` qui donne son intervalle comme il donne son nom.
    const view = boardView(clock.current, signIndex);
    if (!lastView.current || !sameBoardView(lastView.current, view)) {
      lastView.current = view;
      board.redraw(signIndex, view);
    }
  });

  const signY = canopyY - 0.77;
  // Hauteur libre entre le haut d'un caisson et la sous-face de l'auvent : les
  // suspentes se calculaient à longueur fixe et ressortaient sur le toit.
  const bandHang = Math.max(0.06, 0.5 - 0.31);

  // Le 発車標, à l'emprise de la rangée qu'il partage. L'écran garde son 4:1
  // (le canvas fait 1024 × 256) : c'est la LARGEUR disponible qui commande sa
  // hauteur, et le caisson suit — sur un quai étroit, le tableau rétrécit
  // comme le caisson 番線 à côté de lui, au lieu de s'y écraser.
  const boardScreenW = boardBox.w - 0.08;
  const boardScreenH = boardScreenW / 4;
  const boardCaseH = boardScreenH + 0.08;
  /**
   * Les caissons de la rangée s'alignent par le BAS, à la hauteur libre
   * commune : c'est cette ligne-là qu'on lit en enfilade, et deux caissons de
   * hauteurs différentes centrés au même niveau ne font pas une rangée.
   */
  const boardBottom = PLATFORM_TOP + SIGN_BOTTOM - 0.03;
  const boardHang = Math.max(0.06, canopyY - (boardBottom + boardCaseH));

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

      {/* Plaques de nom de gare verticales, vissées sur les poteaux de
          charpente — 0,18 × 0,90 m, le 1:5 de la plaque réelle (celle du quai
          Yamanote de Tokyo mesure environ 100 × 20 cm). Le bas est à 1,55 m
          au-dessus du quai : au-dessus du bandeau de poteau, sous la poutre. */}
      {plateZ.map((z) => (
        <mesh
          name="plaque-nom"
          key={`plate${z}`}
          position={[postFaceX - 0.012, PLATFORM_TOP + 2.0, z]}
          rotation={[0, -Math.PI / 2, 0]}
          material={materials.totem}
        >
          <planeGeometry args={[0.18, 0.9]} />
        </mesh>
      ))}

      {/* 発車標, sur la rangée du bord de voie, en travers du quai et
          recto-verso : c'est le tableau de ceux qui attendent, et on doit
          l'avoir de face en marchant vers lui — d'un côté comme de l'autre. */}
      {boardZ.map((z) => (
        <group
          name="afficheur"
          key={`board${z}`}
          position={[boardBox.x, boardBottom + boardCaseH / 2, z]}
        >
          {/* Suspentes jusqu'à la sous-face de l'auvent, au même aplomb que
              celles des caissons 番線 de la rangée. */}
          {[-1, 1].map((d) => (
            <mesh
              key={d}
              position={[d * boardBox.hx, boardCaseH / 2 + boardHang / 2, 0]}
              material={metal}
            >
              <boxGeometry args={[0.05, boardHang, 0.05]} />
            </mesh>
          ))}
          <mesh material={frame}>
            <boxGeometry args={[boardBox.w, boardCaseH, 0.09]} />
          </mesh>
          {[1, -1].map((d) => (
            <mesh
              key={d}
              position={[0, 0, d * 0.051]}
              rotation={[0, d === 1 ? 0 : Math.PI, 0]}
              material={materials.board}
            >
              <planeGeometry args={[boardScreenW, boardScreenH]} />
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
          {/* Sorties et correspondances : ce que porte un totem autonome. */}
          <mesh
            position={[-0.12, 1.42, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            material={materials.guide}
          >
            <planeGeometry args={[0.3, 0.64]} />
          </mesh>
          <mesh position={[0, 2.35, 0]} material={accent}>
            <boxGeometry args={[0.28, 0.12, 0.4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
