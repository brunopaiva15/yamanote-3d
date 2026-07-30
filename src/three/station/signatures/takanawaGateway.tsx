// JY26 高輪ゲートウェイ - la seule gare de la boucle dont l'architecture est
// entièrement propre.
//
// Kengo Kuma. Une immense toiture blanche, décrite par JR East comme inspirée
// de l'origami et des panneaux japonais en papier : des versants pliés qui
// enjambent d'un seul tenant les deux quais et les quatre voies, portés par des
// fermes triangulaires où le cèdre du Japon et l'acier blanc alternent. Entre
// les plis, du verre : c'est de là que vient la lumière, et c'est ce qui fait
// de Takanawa Gateway la gare la plus claire des trente.
//
// La version précédente était juste et invisible. Elle dessinait tout ça
// AU-DESSUS de la dalle d'auvent générique - un plafond blanc, plat et opaque à
// six mètres - si bien que du quai on ne voyait ni le pli, ni le bois, ni le
// verre : rien qu'un aplat blanc, exactement ce que cette gare-là n'est pas.
// Le gabarit déclare donc maintenant `sigCanopy` et la dalle tombe : la
// toiture pliée EST la couverture du quai, et tout ce qui suit se regarde d'en
// dessous.
//
// Ce qui doit se reconnaître au premier coup d'œil, dans cet ordre :
//   · le pli - vingt-cinq travées de pans blancs cassés en accordéon ;
//   · le cèdre - membrures, arbalétriers, branches, mains courantes ;
//   · les noues de verre, une bande de jour tous les neuf mètres ;
//   · les colonnes-arbres, dont les branches ouvrent sous les fermes ;
//   · les mezzanines vitrées qui franchissent tout le site ;
//   · le mur-rideau de fond, toute hauteur, meneaux blancs et traverses bois.
//
// Tout ce qui précède est fait de boîtes, et toutes les boîtes d'un même
// matériau tiennent dans un seul appel de rendu : trois maillages instanciés
// (blanc, bois, verre) portent la gare entière.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PLATFORM_TOP, PSD_X } from '../../../data/stationGeometry';
import { takanawaDeckZs } from '../../../data/stationLayouts';
import { mat, matOriented, tiltXZ, tiltZ, useInstances } from '../instancing';
import { bays, member, siteCut, useSigMaterials, type SigProps } from './kit';

/** Entraxe des fermes (m) : la trame du pliage. */
const FOLD = 9;
/** Pente d'un versant. Faible : la toiture est un pliage, pas une bâche. */
const PITCH = 0.2;
/**
 * Débord de la toiture au-delà du site, de chaque côté (m).
 *
 * Il valait 1,40 : la rive tombait alors PILE sur l'axe de notre propre voie,
 * et depuis le quai on avait le ciel au-dessus de la rame. Une toiture qui
 * enjambe les quatre voies les enjambe toutes, la nôtre comprise.
 */
const EAVES = 4.4;
/** Pli d'un pan entre deux fermes - l'accordéon, mesuré le long de la voie. */
const PLEAT = 0.115;
/** Largeur de la noue vitrée laissée entre deux pans. */
const VALLEY = 1;
/** Demi-largeur d'une mezzanine (m). */
const DECK_HALF = 2.5;

export function TakanawaGateway({ layout, place, m }: SigProps) {
  const { oppBackX } = siteCut(place);
  const top = layout.canopyY;
  const len = layout.length;
  // La toiture couvre tout le site, débords compris : de l'autre côté de notre
  // voie jusqu'au-delà du mur-rideau de fond.
  const x0 = PSD_X - EAVES;
  const x1 = oppBackX + EAVES;
  const span = x1 - x0;
  const midX = (x0 + x1) / 2;
  const half = span / 2;
  /** Hauteur du faîte au-dessus de la rive. */
  const rise = half * Math.tan(PITCH);
  const slopeLen = half / Math.cos(PITCH);

  // --- Les six niveaux de la coupe --------------------------------------
  // Ils s'empilent dans cet ordre et ne se croisent jamais : trame technique,
  // tablier de mezzanine, garde-corps, membrure basse des fermes, rive de
  // toiture, faîte. La signalétique, elle, reste sous la trame technique.
  /** Dessus du tablier des mezzanines. */
  const deckY = top + 0.65;
  /** Membrure basse des fermes. */
  const chordY = top + 1.85;
  /** Sous-face de la toiture en rive. */
  const eave = top + 2.25;
  /** Sous-face au faîte. */
  const ridge = eave + rise;
  /** Sous-face d'un pan à mi-chemin de la travée, dans la noue. */
  const pleatDrop = (FOLD / 2) * Math.tan(PLEAT);

  const s = useSigMaterials(
    () => ({
      // Acier blanc mat et membrane : la résille, les pans, les meneaux.
      white: new THREE.MeshStandardMaterial({
        color: '#f2f1ec',
        roughness: 0.62,
        metalness: 0.18,
        emissive: '#e8e6de',
        emissiveIntensity: 0.24,
      }),
      // Cèdre du Japon : tout ce qui porte, et tout ce qu'on touche.
      wood: new THREE.MeshStandardMaterial({
        color: '#c99a5f',
        roughness: 0.82,
        emissive: '#8a6034',
        emissiveIntensity: 0.16,
      }),
      // Verre des noues et des façades : très transparent, il ne doit rien
      // assombrir - c'est lui qui fait entrer le jour.
      pane: new THREE.MeshStandardMaterial({
        color: '#dfeaf0',
        roughness: 0.08,
        metalness: 0.02,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    }),
    [],
  );

  const foldZ = useMemo(() => bays(len, FOLD), [len]);
  const deckZ = useMemo(() => takanawaDeckZs(len), [len]);
  // Référence STABLE : le gabarit est mémoïsé (data/stationLayouts), un
  // `?? []` en aurait refait un tableau neuf à chaque rendu.
  const posts = layout.sigPlan?.posts;

  // --- Toiture : pans pliés, fermes, noues vitrées ----------------------
  const roof = useMemo(() => {
    const white: THREE.Matrix4[] = [];
    const wood: THREE.Matrix4[] = [];
    const pane: THREE.Matrix4[] = [];

    /** Sous-face du pan sur la ligne de faîte du versant `d`, à la distance u. */
    const soffit = (u: number) => ridge - rise * u;
    /** Abscisse au droit de la fraction u du versant `d`. */
    const at = (d: number, u: number) => midX + d * half * u;

    for (const z of foldZ) {
      // Membrure basse : la grande poutre de cèdre qui traverse tout le site.
      wood.push(mat(midX, chordY, z, span, 0.22, 0.36));

      for (const d of [-1, 1]) {
        // Arbalétrier, sous les pans, dans l'axe du versant.
        wood.push(
          matOriented(
            tiltZ(-d * PITCH),
            midX + (d * half) / 2,
            eave + rise / 2 - 0.15,
            z,
            slopeLen,
            0.26,
            0.42,
          ),
        );

        // Treillis : montants et diagonales entre membrure et arbalétrier.
        // Le montant du faîte (u = 0) n'appartient à personne - il ne se pose
        // qu'une fois, avec le versant de droite.
        for (let k = d < 0 ? 1 : 0; k < 4; k++) {
          const u = k / 4;
          white.push(
            member([at(d, u), chordY + 0.1], [at(d, u), soffit(u) - 0.29], z, 0.11, 0.2),
          );
        }
        for (let k = 0; k < 4; k++) {
          const u = k / 4;
          const v = (k + 1) / 4;
          white.push(
            member([at(d, u), chordY], [at(d, v), soffit(v) - 0.28], z, 0.1, 0.18),
          );
        }

        // Les deux demi-pans de la travée : ils montent vers la ferme et
        // redescendent vers la noue. C'est le pli, et c'est toute la gare.
        for (const side of [-1, 1]) {
          const zOff = FOLD / 4 - VALLEY / 4;
          white.push(
            matOriented(
              tiltXZ(-d * PITCH, side * PLEAT),
              midX + (d * half) / 2,
              eave + rise / 2 + 0.08 - zOff * Math.tan(PLEAT),
              z + side * zOff,
              slopeLen * 0.998,
              0.15,
              FOLD / 2 - VALLEY / 2,
            ),
          );
        }
      }
    }

    // Noues vitrées : une bande de jour en travers de toute la coupe, tous les
    // neuf mètres, calée au creux du pli. C'est la lumière de cette gare.
    for (const z of [foldZ[0] - FOLD / 2, ...foldZ.map((v) => v + FOLD / 2)]) {
      for (const d of [-1, 1]) {
        pane.push(
          matOriented(
            tiltZ(-d * PITCH),
            midX + (d * half) / 2,
            eave + rise / 2 + 0.02 - pleatDrop,
            z,
            slopeLen,
            0.07,
            VALLEY,
          ),
        );
      }
    }

    // Panne faîtière et pannes de rive : ce qui tient le pliage dans l'autre
    // sens. La faîtière reste AU-DESSUS du creux des noues, sinon elle les
    // traverse toutes les neuf mètres.
    wood.push(mat(midX, ridge - 0.26, 0, 0.38, 0.36, len - 4));
    for (const x of [x0 + 0.55, x1 - 0.55]) {
      wood.push(mat(x, eave - 0.28, 0, 0.36, 0.42, len - 4));
    }

    return { white, wood, pane };
  }, [foldZ, midX, half, span, len, x0, x1, eave, ridge, rise, chordY, slopeLen, pleatDrop]);

  // --- Colonnes-arbres --------------------------------------------------
  // Un fût de cèdre, une bague d'acier, et quatre branches qui s'ouvrent sous
  // la ferme. Elles ne s'écartent QUE dans la coupe : le long de la voie, la
  // colonne reste mince, et ne peut donc pas venir buter dans une poutre
  // transversale ou dans une potence de signalétique.
  const trees = useMemo(() => {
    const white: THREE.Matrix4[] = [];
    const wood: THREE.Matrix4[] = [];
    /** Naissance des branches. */
    const fork = PLATFORM_TOP + 4.4;

    for (const p of posts ?? []) {
      // Sur l'épine de notre quai, et sur celle du quai d'en face - en retrait
      // du mur-rideau, pas encastrée dedans.
      for (const x of [p.x, oppBackX - 1.5]) {
        wood.push(mat(x, (PLATFORM_TOP + fork) / 2, p.z, 0.42, fork - PLATFORM_TOP, 0.42));
        white.push(mat(x, PLATFORM_TOP + 1.45, p.z, 0.5, 0.16, 0.5));
        white.push(mat(x, fork + 0.09, p.z, 0.64, 0.18, 0.64));
        for (const dx of [-2.6, -1, 1, 2.6]) {
          // Une branche ne sort pas de la toiture : au fond de la travée
          // d'en face, il ne reste qu'un mètre quarante de débord.
          const tx = Math.min(x1 - 0.6, Math.max(x0 + 0.6, x + dx));
          wood.push(member([x, fork], [tx, chordY - 0.12], p.z, 0.17, 0.28));
        }
      }
    }
    return { white, wood };
  }, [posts, oppBackX, x0, x1, chordY]);

  // --- Mezzanines vitrées ------------------------------------------------
  // Elles franchissent TOUT le site : depuis le quai on les a au-dessus de la
  // tête, et c'est de là-haut qu'on voit à la fois le hall et les quatre voies.
  // La première ressort au-delà du mur-rideau - ce sont les passerelles qui
  // mènent aux tours de Takanawa Gateway City.
  const decks = useMemo(() => {
    const white: THREE.Matrix4[] = [];
    const wood: THREE.Matrix4[] = [];
    const pane: THREE.Matrix4[] = [];

    deckZ.forEach((z, i) => {
      const xA = PSD_X + 0.2;
      const xB = i === 0 ? x1 + 8 : oppBackX + 0.8;
      const w = xB - xA;
      const cx = (xA + xB) / 2;
      // Tablier et sous-face de cèdre. Rien ne descend sous 6,30 : les
      // longerons de la trame technique courent juste dessous.
      white.push(mat(cx, deckY - 0.15, z, w, 0.3, DECK_HALF * 2));
      wood.push(mat(cx, deckY - 0.34, z, w - 0.6, 0.07, DECK_HALF * 2 - 0.7));
      for (const d of [-1, 1]) {
        // Bandeau de rive, garde-corps de verre, main courante de cèdre.
        white.push(mat(cx, deckY - 0.13, z + d * DECK_HALF, w, 0.38, 0.16));
        pane.push(mat(cx, deckY + 0.46, z + d * (DECK_HALF - 0.03), w, 0.86, 0.05));
        wood.push(mat(cx, deckY + 0.94, z + d * (DECK_HALF - 0.03), w, 0.09, 0.16));
      }
    });
    return { white, wood, pane };
  }, [deckZ, deckY, oppBackX, x1]);

  // --- Mur-rideau de fond ------------------------------------------------
  // La travée d'en face se fermait sur un aplat clair de six mètres. Elle se
  // ferme maintenant sur du verre toute hauteur, meneaux blancs et traverses de
  // cèdre : au-dessus du mur, c'est la ville qu'on voit à travers.
  const facade = useMemo(() => {
    const white: THREE.Matrix4[] = [];
    const wood: THREE.Matrix4[] = [];
    const pane: THREE.Matrix4[] = [];
    const fx = oppBackX - 0.22;
    const fTop = eave - 0.2;
    const h = fTop - PLATFORM_TOP;
    const glazed = len - 6;

    pane.push(mat(fx, PLATFORM_TOP + h / 2, 0, 0.08, h, glazed));
    for (let z = -glazed / 2; z <= glazed / 2 + 0.01; z += 4.5) {
      white.push(mat(fx - 0.06, PLATFORM_TOP + h / 2, z, 0.16, h, 0.24));
    }
    for (const y of [2.55, 5.6]) {
      wood.push(mat(fx - 0.06, y, 0, 0.2, 0.17, glazed));
    }
    white.push(mat(fx - 0.06, fTop - 0.12, 0, 0.24, 0.24, glazed));
    return { white, wood, pane };
  }, [oppBackX, eave, len]);

  // --- Trame technique ---------------------------------------------------
  // Les néons du quai affleuraient la sous-face de l'auvent ; l'auvent parti,
  // ils flottaient. Deux longerons blancs les reprennent, posés sur les
  // poutres transversales : c'est le chemin de lumière d'une grande halle, et
  // il court exactement sur les deux lignes de néons (three/station/Station).
  const rails = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    for (const f of [0.28, 0.72]) {
      out.push(mat(PSD_X + layout.depth * f, top + 0.07, 0, 0.36, 0.14, len - 6));
    }
    return out;
  }, [layout.depth, top, len]);

  const white = useMemo(
    () => [...roof.white, ...trees.white, ...decks.white, ...facade.white, ...rails],
    [roof, trees, decks, facade, rails],
  );
  const wood = useMemo(
    () => [...roof.wood, ...trees.wood, ...decks.wood, ...facade.wood],
    [roof, trees, decks, facade],
  );
  const pane = useMemo(
    () => [...roof.pane, ...decks.pane, ...facade.pane],
    [roof, decks, facade],
  );

  const whiteRef = useRef<THREE.InstancedMesh>(null);
  const woodRef = useRef<THREE.InstancedMesh>(null);
  const paneRef = useRef<THREE.InstancedMesh>(null);
  useInstances(whiteRef, white);
  useInstances(woodRef, wood);
  useInstances(paneRef, pane);

  return (
    <group>
      <instancedMesh
        ref={whiteRef}
        args={[undefined, undefined, Math.max(1, white.length)]}
        material={s.white}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={woodRef}
        args={[undefined, undefined, Math.max(1, wood.length)]}
        material={s.wood}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={paneRef}
        args={[undefined, undefined, Math.max(1, pane.length)]}
        material={s.pane}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Le quai reçoit son bandeau lumineux d'égout - calé SOUS les poutres
          transversales : au ras de la sous-face, il les traversait toutes. */}
      {[PSD_X + 0.8, place.farEdgeX !== null ? place.farEdgeX - 0.8 : place.backX].map((x) => (
        <mesh key={`l${x}`} position={[x, top - 0.215, 0]} material={m.lamp}>
          <boxGeometry args={[0.42, 0.07, len - 8]} />
        </mesh>
      ))}
    </group>
  );
}
