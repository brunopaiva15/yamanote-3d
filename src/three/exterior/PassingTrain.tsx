// La rame d'en face : dix caisses de Keihin-Tōhoku qui traversent la gare à
// 90 km/h sans même lever le pied.
//
// Ce n'est pas notre rame, et ça se voit : caisse inox à deux traits bleus
// (livrée E233-1000) là où la nôtre porte le vert uguisu aux portes, dix
// voitures au lieu de onze, portes closes du début à la fin - personne ne
// monte dans un train qui passe.
//
// La coque, elle, est celle du E235 (three/exterior/carShellGeometry) : à
// vingt-cinq mètres par seconde, ce qui distingue deux séries d'EMU japonais
// n'est pas la découpe des baies, c'est la livrée et la longueur. Modéliser
// une seconde caisse complète coûterait le double de mémoire pour une nuance
// que personne n'a le temps de lire.
//
// Rien n'est construit tant qu'aucun passage n'est annoncé : la rame naît
// pendant l'annonce (`passingTrain.armed`), une trentaine de secondes avant
// d'entrer en gare, et resservira ensuite jusqu'à la fin de la session.
//
// Repère : le groupe extérieur reprend celui du QUAI (demi-tour selon le côté
// d'ouverture, glissement `platformSlide`), exactement comme three/station -
// c'est le seul moyen que la voie d'en face reste la voie d'en face.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { E235 } from '../../data/e235';
import { DOOR_SIDE } from '../../data/stations';
import { useStore } from '../../store';
import { runtime } from '../../systems/runtime';
import { PASS_CARS, PASS_LENGTH, passingTrain } from '../../systems/passingTrain';
import {
  makeBellowsTexture,
  makeBogieTexture,
  makeDestinationSign,
  makeRoofTexture,
  makeStainlessRoughness,
  makeStainlessTexture,
} from '../../textures/trainExterior';
import { applyShadowFlags } from '../shadowFlags';
import { buildCarGeometries, buildPantograph } from './carShellGeometry';
import { buildCab } from './cabGeometry';

/**
 * Livrée Keihin-Tōhoku : la caisse est l'inox de tout le monde, la ligne tient
 * dans son bleu - スカイブルー, le même depuis 1957 - posé en deux traits, un
 * large à la ceinture de caisse et un fin sous le pavillon.
 */
const KT = {
  blue: '#00a7db',
  glass: '#8f9ba4',
} as const;

/** Les deux traits, en cotes de caisse (le bas des baies est à 0,85). */
const STRIPES = [
  { y0: 0.56, y1: 0.83 },
  { y0: 2.18, y1: 2.27 },
] as const;

/** Voitures à pantographe, sur dix. */
const PANTO_CARS = [2, 5, 8];

/** Abscisse du centre de la voiture `i`, rame centrée sur son propre origine. */
function carZ(i: number): number {
  return (i - (PASS_CARS - 1) / 2) * E235.pitch;
}

interface Built {
  root: THREE.Group;
  sign: { redraw: (s: string) => void };
  dispose: () => void;
}

const M = new THREE.Matrix4();
/** Demi-tour pour les hublots du côté −x (voir TrainConsist.layoutLeaves). */
const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);

function tiled(tex: THREE.Texture, k: number): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(k, k);
  return tex;
}

function build(): Built {
  const root = new THREE.Group();
  root.name = 'rame-en-face';
  const geos = buildCarGeometries();
  const trash: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    trash.push(o);
    return o;
  };

  const stainless = track(tiled(makeStainlessTexture(), 0.5));
  const stainlessRough = track(tiled(makeStainlessRoughness(), 0.5));
  const roofTex = track(tiled(makeRoofTexture(), 0.5));
  const bogieTex = track(makeBogieTexture());
  const bellowsTex = track(makeBellowsTexture());
  const sign = makeDestinationSign({
    kanji: '京浜東北線',
    romaji: 'Keihin-Tohoku Line',
    tint: '#7fd4f2',
  });
  track(sign.texture);

  const mats = {
    body: track(
      new THREE.MeshStandardMaterial({
        map: stainless,
        roughnessMap: stainlessRough,
        color: '#ffffff',
        metalness: 0.72,
        roughness: 0.44,
      }),
    ),
    stripe: track(new THREE.MeshStandardMaterial({ color: KT.blue, roughness: 0.5 })),
    // Masque de cabine : de l'inox lisse, sans la trame de caisse - le nez
    // est moulé d'une pièce et n'a pas les nervures des flancs.
    mask: track(
      new THREE.MeshStandardMaterial({ color: '#d3d6da', roughness: 0.46, metalness: 0.55 }),
    ),
    roof: track(new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.9, metalness: 0.12 })),
    underframe: track(new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.86 })),
    bogie: track(
      new THREE.MeshStandardMaterial({ map: bogieTex, roughness: 0.72, metalness: 0.35 }),
    ),
    // Un peu plus sombre que les nôtres : on regarde ces vitres de dehors, en
    // contre-jour, et il n'y a personne à y distinguer.
    glass: track(
      new THREE.MeshStandardMaterial({
        color: KT.glass,
        roughness: 0.09,
        metalness: 0.35,
        transparent: true,
        opacity: 0.66,
      }),
    ),
    liner: track(
      new THREE.MeshStandardMaterial({ color: '#dcdbd5', roughness: 0.92, side: THREE.BackSide }),
    ),
    // Les vantaux du E233 sont en inox comme la caisse : le bleu ne descend
    // pas sur les portes.
    leaf: track(
      new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.5, metalness: 0.6 }),
    ),
    bellows: track(
      new THREE.MeshStandardMaterial({ map: bellowsTex, color: '#25282c', roughness: 0.95 }),
    ),
    black: track(
      new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.22, metalness: 0.1 }),
    ),
    sign: track(new THREE.MeshBasicMaterial({ map: sign.texture, toneMapped: false })),
    headlight: track(
      new THREE.MeshStandardMaterial({
        color: '#fff8e8',
        emissive: '#fff1cf',
        emissiveIntensity: 1.2,
        roughness: 0.3,
      }),
    ),
    taillight: track(
      new THREE.MeshStandardMaterial({
        color: '#8c1414',
        emissive: '#c81f1f',
        emissiveIntensity: 0.5,
        roughness: 0.4,
      }),
    ),
    metal: track(
      new THREE.MeshStandardMaterial({ color: '#7d838a', roughness: 0.42, metalness: 0.6 }),
    ),
    insulator: track(new THREE.MeshStandardMaterial({ color: '#5c4a3a', roughness: 0.7 })),
  };

  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number) => {
    track(geo);
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    root.add(im);
    return im;
  };

  // --- Une instance par voiture, pour chaque matériau ---
  for (const [geo, mat] of [
    [geos.body, mats.body],
    [geos.roof, mats.roof],
    [geos.underframe, mats.underframe],
    [geos.bogies, mats.bogie],
    [geos.glass, mats.glass],
    [geos.liner, mats.liner],
  ] as const) {
    const im = instanced(geo, mat, PASS_CARS);
    for (let i = 0; i < PASS_CARS; i++) im.setMatrixAt(i, M.makeTranslation(0, 0, carZ(i)));
    im.instanceMatrix.needsUpdate = true;
  }
  // L'habillage vert aux portes du E235 ne sert pas ici : la rame d'en face
  // n'en a pas. Sa géométrie est construite avec les autres, autant la rendre.
  // Même chose pour la peau à abouts ouverts : elle n'a de sens que pour la
  // voiture du joueur, et le joueur n'est jamais dans celle-ci.
  geos.band.dispose();
  geos.bodyOpen.dispose();

  // --- Les deux traits bleus, quatre par voiture (deux flancs, deux traits) ---
  const stripeGeo = new THREE.BoxGeometry(1, 1, 1);
  const stripes = instanced(stripeGeo, mats.stripe, PASS_CARS * 4);
  {
    let k = 0;
    const t = 0.03;
    for (let i = 0; i < PASS_CARS; i++) {
      for (const s of [1, -1] as const) {
        for (const b of STRIPES) {
          M.compose(
            new THREE.Vector3(s * (E235.halfWidth + t / 2 - 0.004), (b.y0 + b.y1) / 2, carZ(i)),
            new THREE.Quaternion(),
            new THREE.Vector3(t, b.y1 - b.y0, E235.bodyHalfLen * 2 - 0.12),
          );
          stripes.setMatrixAt(k++, M);
        }
      }
    }
    stripes.instanceMatrix.needsUpdate = true;
  }

  // --- Vantaux, fermés une fois pour toutes ---
  const leafCount = PASS_CARS * E235.doorCenters.length * 4;
  const leaves = instanced(geos.doorLeaf, mats.leaf, leafCount);
  const leafGlass = instanced(geos.doorGlass, mats.glass, leafCount);
  {
    let k = 0;
    for (let i = 0; i < PASS_CARS; i++) {
      const cz = carZ(i);
      for (const dz of E235.doorCenters) {
        for (const s of [1, -1] as const) {
          for (const dir of [1, -1] as const) {
            M.makeTranslation(s * (E235.halfWidth + 0.03), 0, cz + dz + dir * (E235.doorHalfW / 2));
            leaves.setMatrixAt(k, M);
            const gm = M.clone();
            if (s === -1) gm.multiply(FLIP);
            leafGlass.setMatrixAt(k, gm);
            k++;
          }
        }
      }
    }
    leaves.instanceMatrix.needsUpdate = true;
    leafGlass.instanceMatrix.needsUpdate = true;
  }

  // --- Soufflets ---
  const bellows = instanced(geos.bellows, mats.bellows, PASS_CARS - 1);
  for (let i = 0; i < PASS_CARS - 1; i++) {
    bellows.setMatrixAt(i, M.makeTranslation(0, 0, carZ(i) + E235.pitch / 2));
  }
  bellows.instanceMatrix.needsUpdate = true;

  // --- Cabines aux deux bouts ---
  // Le damier du E235 n'existe pas sur cette série : sous le pare-brise, la
  // face avant porte le bleu de la ligne, d'un montant à l'autre.
  const front = track(new THREE.MeshBasicMaterial({ color: KT.blue, toneMapped: false }));
  for (const [i, dir] of [
    [0, -1],
    [PASS_CARS - 1, 1],
  ] as const) {
    const cab = buildCab({
      green: mats.mask,
      black: mats.black,
      checker: front,
      sign: mats.sign,
      headlight: mats.headlight,
      taillight: mats.taillight,
      underframe: mats.underframe,
      metal: mats.metal,
    });
    cab.position.z = carZ(i);
    if (dir === -1) cab.rotation.y = Math.PI;
    root.add(cab);
  }

  for (const i of PANTO_CARS) {
    const p = buildPantograph({ metal: mats.metal, insulator: mats.insulator });
    p.position.z = carZ(i) + 5.6;
    root.add(p);
  }

  applyShadowFlags(root);
  root.visible = false;
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__passConsist = root;
  }
  return {
    root,
    sign,
    dispose: () => {
      for (const d of trash) d.dispose();
    },
  };
}

/** Ce qu'affiche la girouette, selon ce qui traverse. */
function signText(kind: string): string {
  // Le jeu tourne en 内回り : la voie d'en face est alors toujours celle du
  // nord (北行), donc un rapide y va vers Ōmiya. Voir data/passingTrains.
  return kind === 'rapid' ? '快速 大宮' : '回送';
}

export function PassingTrain() {
  const frame = useRef<THREE.Group>(null);
  const built = useRef<Built | null>(null);
  const lastSign = useRef('');

  useEffect(
    () => () => {
      built.current?.dispose();
      built.current = null;
    },
    [],
  );

  useFrame(() => {
    const g = frame.current;
    if (!g) return;
    // Construction à l'annonce, pas au montage : tant que personne n'a jamais
    // vu passer de train, cette rame n'existe pas.
    if (!built.current) {
      if (!passingTrain.armed) return;
      built.current = build();
      g.add(built.current.root);
    }
    const b = built.current;
    const visible = passingTrain.running && runtime.platformFade > 0.02;
    b.root.visible = visible;
    if (!visible) return;

    const wanted = signText(passingTrain.kind);
    if (wanted !== lastSign.current) {
      lastSign.current = wanted;
      b.sign.redraw(wanted);
    }

    // Même repère que le quai : demi-tour selon le côté d'ouverture, puis
    // glissement le long de la voie.
    const side = DOOR_SIDE[useStore.getState().platformIndex];
    g.rotation.y = side === 1 ? 0 : Math.PI;
    g.position.z = runtime.platformSlide;
    b.root.position.x = passingTrain.trackX;
    // `passingTrain.z` est le NEZ ; la rame est centrée sur son origine.
    b.root.position.z = passingTrain.z + PASS_LENGTH / 2;
  });

  return <group ref={frame} name="passage" />;
}
