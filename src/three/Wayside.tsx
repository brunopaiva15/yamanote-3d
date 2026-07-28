// L'emprise ferroviaire : tout ce qui borde la voie à moins de dix mètres.
//
// C'est le rang qui défile le plus vite, donc CELUI QUI VEND LA VITESSE. Il
// s'est longtemps résumé à huit portiques caténaires et douze arbres boules —
// un objet toutes les trente secondes de regard, là où une voie réelle en
// présente un par seconde.
//
// Ce qu'on en voit vraiment, depuis une baie : assis, l'œil est à 1,16 m et le
// bas de vitre à 0,95 m ; le rayon rasant ne touche le sol que vers quatre
// mètres. Tout ce qui est plus bas et plus près est invisible de l'intérieur.
// D'où le choix de ce qui est modélisé ici — ce qui se tient entre un demi-mètre
// et trois mètres de haut, à quatre à huit mètres de l'axe :
//
//   · la plate-forme — ballast, traverses, rails, caniveaux à câbles ;
//   · le garde-corps de viaduc, la plus forte affirmation qu'on court en l'air ;
//   · le mobilier de voie recyclé — signaux, armoires relais, bornes ;
//   · les portiques caténaires, désormais porteurs de leurs fils.
//
// Chaque famille est fusionnée en UNE géométrie rendue par un InstancedMesh :
// un signal, ce sont cinq volumes, et il en passe un tous les cent soixante
// mètres — sans fusion, le premier plan coûterait plus cher que la ville.
//
// Tout est recyclé le long de z par `runtime.distance`, et tout s'efface dans
// l'emprise longitudinale du quai (systems/stationOcclusion) : la gare porte sa
// propre caténaire et son propre mobilier.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { segEnv } from '../systems/segmentEnv';
import { hiddenByStation, sidePush } from '../systems/stationOcclusion';
import { qualityLevel, usePerf } from '../systems/perf';
import { TRACK_BED_TILE, TRACK_BED_WIDTH, makeGroundTexture } from '../textures/procedural';
import { GAUGE_HALF } from '../data/stationGeometry';

/** Longueur des plans au sol : la vue en biais vers le fond du wagon porte loin. */
const PLANE_LEN = 460;
/** Niveau de la plate-forme. */
const RAIL_Y = -1.15;

const POLE_X = 5.2;
const POLE_COUNT = 8;
const POLE_SPACING = 30;
/** Hauteur du foyer d'éclairage porté par les mâts (m). */
const LAMP_Y = 5.15;
/** Déport du foyer vers la voie (m). */
const LAMP_REACH = 0.95;
/** Hauteur du fil de contact au-dessus du rail (m). */
const CONTACT_Y = 4.9;
/** Hauteur du câble porteur à l'aplomb d'un portique (m). */
const MESSENGER_Y = 6.05;
/** Flèche du porteur à mi-portée (m). */
const MESSENGER_SAG = 0.55;

/** Le garde-corps se pose SUR le tablier, dont la joue est en 5,1. */
const RAILING_X = 5.0;
const RAILING_PANEL = 10; // longueur d'un panneau de garde-corps (m)
const RAILING_PANELS = 15; // ± 75 m : au-delà, un garde-corps n'est plus qu'un trait

const TREE_COUNT = 12;
const TREE_SPACING = 21;

// --- Fabriques de géométrie fusionnée ---------------------------------------

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cylAt(
  rt: number,
  rb: number,
  h: number,
  seg: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

/** Fil tendu entre deux portiques, avec sa flèche. */
function wire(y0: number, sag: number, span: number, radius: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Chaînette approchée par une parabole : à cette échelle l'œil ne fait pas
    // la différence, et la courbe coûte huit points au lieu d'une intégrale.
    pts.push(new THREE.Vector3(0, y0 - sag * 4 * t * (1 - t), t * span));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, radius, 4, false);
}

/**
 * Portique caténaire et la portée qu'il porte : deux mâts, une traverse, le
 * câble porteur, le fil de contact et leurs pendules.
 *
 * Les portées sont identiques et espacées de POLE_SPACING : une portée
 * accrochée à chaque portique pave donc la voie sans couture, y compris au
 * recyclage.
 */
function makePortalGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(cylAt(0.09, 0.13, 7, 8, s * POLE_X, 2.2, 0));
    parts.push(boxAt(0.16, 0.16, 0.16, s * POLE_X, 5.72, 0)); // tête de mât
    // Potence d'éclairage : sur JR East, les foyers sont portés par les mâts
    // de caténaire eux-mêmes. Ils héritent donc de leur entraxe — et c'est ce
    // chapelet, une lumière toutes les trente mètres, qui dit la nuit.
    parts.push(boxAt(LAMP_REACH, 0.07, 0.07, s * (POLE_X - LAMP_REACH / 2), LAMP_Y, 0));
    parts.push(boxAt(0.34, 0.09, 0.2, s * (POLE_X - LAMP_REACH), LAMP_Y - 0.07, 0));
  }
  parts.push(boxAt(10.6, 0.14, 0.14, 0, 5.4, 0));
  // Pendules : ils relient le porteur au fil de contact, et c'est leur rythme
  // qu'on lit en passant dessous, bien plus que les fils eux-mêmes.
  const drops = 5;
  for (let i = 1; i < drops; i++) {
    const t = i / drops;
    const top = MESSENGER_Y - MESSENGER_SAG * 4 * t * (1 - t);
    parts.push(boxAt(0.03, top - CONTACT_Y, 0.03, 0, (top + CONTACT_Y) / 2, t * POLE_SPACING));
  }
  parts.push(wire(MESSENGER_Y, MESSENGER_SAG, POLE_SPACING, 0.035));
  parts.push(wire(CONTACT_Y, 0.04, POLE_SPACING, 0.03));
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

/** Panneau de garde-corps de viaduc : montants, deux lisses et une plinthe. */
function makeRailingGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < RAILING_PANEL / 2.5; i++) {
    parts.push(boxAt(0.07, 1.1, 0.07, 0, 0.55, i * 2.5));
  }
  const mid = RAILING_PANEL / 2 - 1.25;
  for (const y of [1.05, 0.62]) parts.push(boxAt(0.05, 0.05, RAILING_PANEL, 0, y, mid));
  // La plinthe donne au garde-corps sa masse, et c'est elle qu'on voit d'abord
  // depuis un siège : le regard rasant passe juste au-dessus.
  parts.push(boxAt(0.06, 0.28, RAILING_PANEL, 0, 0.16, mid));
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

/** Signal à feux : mât, écran, couronnement, coffret de pied. */
function makeSignalGeometry(): THREE.BufferGeometry {
  return mergeGeometries(
    [
      cylAt(0.09, 0.11, 4.6, 8, 0, 2.3, 0),
      boxAt(0.5, 1.35, 0.22, 0, 5.2, 0.16),
      boxAt(0.62, 0.1, 0.1, 0, 5.9, 0.16),
      boxAt(0.26, 0.26, 0.12, 0, 4.36, 0.3),
      boxAt(0.34, 0.5, 0.3, 0.34, 3.2, 0),
    ],
    false,
  ) as THREE.BufferGeometry;
}

/** Armoire relais sur son socle. */
function makeCabinetGeometry(): THREE.BufferGeometry {
  return mergeGeometries(
    [
      boxAt(0.62, 0.18, 1.1, 0, 0.09, 0),
      boxAt(0.5, 1.35, 0.95, 0, 0.85, 0),
      boxAt(0.56, 0.09, 1.01, 0, 1.56, 0),
    ],
    false,
  ) as THREE.BufferGeometry;
}

/** Borne : poteau et plaque — repère kilométrique, limite de vitesse. */
function makePostGeometry(): THREE.BufferGeometry {
  return mergeGeometries(
    [cylAt(0.045, 0.055, 1.7, 6, 0, 0.85, 0), boxAt(0.06, 0.46, 0.46, 0, 1.62, 0)],
    false,
  ) as THREE.BufferGeometry;
}

/** Famille de mobilier : géométrie, teinte, entraxe, distance à l'axe. */
interface Kit {
  key: string;
  geo: THREE.BufferGeometry;
  color: string;
  metalness: number;
  count: number;
  spacing: number;
  x: number;
  /** Décalage de départ, pour que les familles ne s'alignent pas. */
  phase: number;
}

export function Wayside() {
  const perfLevel = usePerf((s) => qualityLevel(s.quality));
  // Paliers 4-5 : le mobilier de voie disparaît ; la plate-forme, les rails et
  // les portiques restent — le strict nécessaire pour lire la vitesse.
  const furniture = perfLevel < 4;

  const built = useMemo(() => {
    const bedTex = makeGroundTexture();
    bedTex.repeat.set(1, PLANE_LEN / TRACK_BED_TILE);
    const bedMat = new THREE.MeshBasicMaterial({ map: bedTex, fog: true, color: '#d6d4ce' });

    const steel = new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: 0.7, metalness: 0.3 });
    const railMat = new THREE.MeshStandardMaterial({
      color: '#b9bcc2',
      roughness: 0.28,
      metalness: 0.85,
    });
    const railingMat = new THREE.MeshStandardMaterial({
      color: '#9aa0a6',
      roughness: 0.6,
      metalness: 0.35,
    });

    const portalGeo = makePortalGeometry();
    const portals = new THREE.InstancedMesh(portalGeo, steel, POLE_COUNT);
    portals.frustumCulled = false;

    const railingGeo = makeRailingGeometry();
    const railings = ([1, -1] as const).map((side) => {
      const mesh = new THREE.InstancedMesh(railingGeo, railingMat, RAILING_PANELS);
      mesh.frustumCulled = false;
      return { side, mesh };
    });

    const kits: Kit[] = furniture
      ? [
          // Depuis un siège, le champ visible s'arrête vers 2,8 m de haut à
          // cinq mètres de l'axe : la tête d'un signal passe au-dessus de la
          // vitre. Ce sont donc les armoires et les bornes, basses et serrées,
          // qui donnent le rythme — le signal, lui, se regarde du quai.
          { key: 'signal', geo: makeSignalGeometry(), color: '#6d7278', metalness: 0.3, count: 3, spacing: 190, x: 4.9, phase: 40 },
          { key: 'cabinet', geo: makeCabinetGeometry(), color: '#8c9096', metalness: 0.25, count: 9, spacing: 52, x: 4.55, phase: 12 },
          { key: 'post', geo: makePostGeometry(), color: '#d8d6cf', metalness: 0.1, count: 12, spacing: 38, x: 4.45, phase: 57 },
        ]
      : [];
    const kitMeshes = kits.map((kit) => {
      const mat = new THREE.MeshStandardMaterial({ color: kit.color, roughness: 0.62, metalness: kit.metalness });
      const mesh = new THREE.InstancedMesh(kit.geo, mat, kit.count);
      mesh.frustumCulled = false;
      return { kit, mesh, mat };
    });

    // Foyers d'éclairage : deux par portique, éteints le jour.
    const lampMat = new THREE.MeshBasicMaterial({ color: '#ffe9c2', toneMapped: false, fog: true });
    // Un volume et non un plan : le foyer doit se lire par en dessous depuis un
    // siège, et de profil depuis le quai.
    const lampGeo = new THREE.BoxGeometry(0.34, 0.07, 0.2);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, POLE_COUNT * 2);
    lamps.frustumCulled = false;

    // Feu du signal : un disque émissif, vert en voie libre, rouge quand la
    // rame est arrêtée en pleine voie.
    const aspectMat = new THREE.MeshBasicMaterial({ color: '#3ad06a', toneMapped: false, fog: true });
    const aspectGeo = new THREE.CircleGeometry(0.15, 12);
    const signalKit = kitMeshes.find((k) => k.kit.key === 'signal');
    const aspects = signalKit ? new THREE.InstancedMesh(aspectGeo, aspectMat, signalKit.kit.count) : null;
    if (aspects) aspects.frustumCulled = false;

    return {
      bedTex,
      bedMat,
      steel,
      railMat,
      railingMat,
      portalGeo,
      portals,
      railingGeo,
      railings,
      kitMeshes,
      lampMat,
      lampGeo,
      lamps,
      aspectGeo,
      aspectMat,
      aspects,
    };
  }, [furniture]);

  const trees = useRef<(THREE.Group | null)[]>([]);

  // Arbres boules (esprit Shashingo) : tronc + deux masses de feuillage.
  const treeSpecs = useMemo(
    () =>
      Array.from({ length: TREE_COUNT }, (_, i) => ({
        x: (i % 2 === 0 ? 1 : -1) * (7.2 + ((i * 13) % 5) * 0.5),
        scale: 0.85 + ((i * 29) % 10) / 22,
        leaf: ['#5fb54a', '#6ec25a', '#54a844'][i % 3],
      })),
    [],
  );

  const scratch = useMemo(
    () => ({
      mtx: new THREE.Matrix4(),
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
      pos: new THREE.Vector3(),
      scl: new THREE.Vector3(1, 1, 1),
      rot: new THREE.Quaternion(),
      axis: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  useFrame(() => {
    const sc = scratch;

    // --- Plate-forme : une tuile de huit mètres tous les huit mètres ---
    built.bedTex.offset.y = runtime.distance / TRACK_BED_TILE;

    /** Pose l'instance `i`, ou l'escamote si la gare l'avale. */
    const place = (mesh: THREE.InstancedMesh, i: number, z: number, x: number, yaw: number) => {
      if (hiddenByStation(z)) {
        mesh.setMatrixAt(i, sc.hidden);
        return;
      }
      sc.pos.set(x, RAIL_Y, z);
      sc.rot.setFromAxisAngle(sc.axis, yaw);
      sc.scl.set(1, 1, 1);
      sc.mtx.compose(sc.pos, sc.rot, sc.scl);
      mesh.setMatrixAt(i, sc.mtx);
    };

    // --- Portiques caténaires ---
    // Un mât tombe à x = ±5,2, en plein milieu du quai : dans l'emprise de la
    // gare le portique s'efface, la caténaire y étant portée par la charpente
    // de l'auvent, comme en vrai.
    const portalSpan = POLE_COUNT * POLE_SPACING;
    for (let i = 0; i < POLE_COUNT; i++) {
      const z = ((runtime.distance + i * POLE_SPACING) % portalSpan) - portalSpan / 2;
      place(built.portals, i, z, 0, 0);
      // Sous-face des deux foyers : posée sous la potence, elle regarde le sol.
      for (let s2 = 0; s2 < 2; s2++) {
        const idx = i * 2 + s2;
        if (hiddenByStation(z)) {
          built.lamps.setMatrixAt(idx, sc.hidden);
          continue;
        }
        const side = s2 === 0 ? 1 : -1;
        sc.pos.set(side * (POLE_X - LAMP_REACH), RAIL_Y + LAMP_Y - 0.13, z);
        sc.rot.identity();
        sc.scl.set(1, 1, 1);
        sc.mtx.compose(sc.pos, sc.rot, sc.scl);
        built.lamps.setMatrixAt(idx, sc.mtx);
      }
    }
    built.portals.instanceMatrix.needsUpdate = true;
    built.lamps.instanceMatrix.needsUpdate = true;

    // --- Garde-corps de viaduc ---
    // Il ne se fond pas : il POUSSE depuis le tablier, comme la joue de tablier
    // de SegmentEnvironment. Un garde-corps translucide se lirait comme un voile.
    const viaduct01 = segEnv.w.viaduct;
    const railingSpan = RAILING_PANELS * RAILING_PANEL;
    for (const r of built.railings) {
      r.mesh.visible = viaduct01 > 0.05;
      if (!r.mesh.visible) continue;
      const push = r.side * sidePush(r.side);
      for (let i = 0; i < RAILING_PANELS; i++) {
        const z = ((runtime.distance + i * RAILING_PANEL) % railingSpan) - railingSpan / 2;
        if (hiddenByStation(z)) {
          r.mesh.setMatrixAt(i, sc.hidden);
          continue;
        }
        sc.pos.set(r.side * RAILING_X + push, RAIL_Y, z);
        sc.rot.identity();
        sc.scl.set(1, viaduct01, 1);
        sc.mtx.compose(sc.pos, sc.rot, sc.scl);
        r.mesh.setMatrixAt(i, sc.mtx);
      }
      r.mesh.instanceMatrix.needsUpdate = true;
    }

    // --- Mobilier de voie : chaque famille son entraxe, son côté, sa phase ---
    for (const { kit, mesh } of built.kitMeshes) {
      const span = kit.count * kit.spacing;
      for (let i = 0; i < kit.count; i++) {
        const z = ((runtime.distance + kit.phase + i * kit.spacing) % span) - span / 2;
        // Un objet sur deux passe de l'autre côté de la voie.
        const side = (i & 1) === 0 ? 1 : -1;
        const x = side * (kit.x + sidePush(side));
        place(mesh, i, z, x, side === 1 ? Math.PI : 0);
        if (kit.key === 'signal' && built.aspects) {
          // Le feu se pose sur la face de l'écran tournée vers la rame.
          if (hiddenByStation(z)) built.aspects.setMatrixAt(i, sc.hidden);
          else {
            sc.pos.set(x - side * 0.2, RAIL_Y + 5.2, z);
            sc.rot.setFromAxisAngle(sc.axis, side === 1 ? Math.PI : 0);
            sc.scl.set(1, 1, 1);
            sc.mtx.compose(sc.pos, sc.rot, sc.scl);
            built.aspects.setMatrixAt(i, sc.mtx);
          }
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (built.aspects) {
      built.aspects.instanceMatrix.needsUpdate = true;
      // Voie libre en vert, sémaphore fermé pendant un arrêt d'urgence.
      const stopped = runtime.emergencyStop.stage !== 'none';
      const w = dayNightWeights(runtime.clockMin / 60);
      const night = Math.min(1, w.night + w.golden * 0.4);
      built.aspectMat.color.set(stopped ? '#ff4633' : '#3ad06a').multiplyScalar(0.55 + 0.75 * night);
    }
    // Les foyers ne s'allument qu'à la tombée du jour, et s'éteignent tout à
    // fait de jour : un lampadaire allumé à quinze heures se remarque.
    {
      const w = dayNightWeights(runtime.clockMin / 60);
      const on = Math.min(1, w.night + w.golden * 0.55);
      built.lampMat.color.set('#ffe9c2').multiplyScalar(on * 1.6);
      built.lamps.visible = on > 0.03;
    }

    // --- Arbres défilants ---
    const treeSpan = TREE_COUNT * TREE_SPACING;
    const treeScale = 1 + 0.18 * segEnv.green; // végétation renforcée (greenery)
    const treesVisible = segEnv.w.trench < 0.5; // pas d'arbres entre les murs
    for (let i = 0; i < TREE_COUNT; i++) {
      const t = trees.current[i];
      if (!t) continue;
      const spec = treeSpecs[i];
      const side = spec.x >= 0 ? 1 : -1;
      t.visible = treesVisible;
      t.scale.setScalar(spec.scale * treeScale);
      t.position.x = spec.x + side * sidePush(side);
      // Les arbres poussent dans la RUE, pas sur le tablier : ils suivent le
      // sol de la ville et se retrouvent sept mètres plus bas sous un viaduc.
      t.position.y = segEnv.cityY;
      t.position.z = ((runtime.distance * 0.999 + i * TREE_SPACING + 9) % treeSpan) - treeSpan / 2;
    }
  });

  return (
    <group>
      {/* Arbres boules défilants le long de la voie */}
      {treeSpecs.map((spec, i) => (
        <group
          key={`tree${i}`}
          ref={(gr) => {
            trees.current[i] = gr;
          }}
          position={[spec.x, -1.1, 0]}
          scale={spec.scale}
        >
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.14, 0.2, 2.2, 8]} />
            <meshStandardMaterial color="#7a5c42" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.9, 0]} scale={[1, 0.88, 1]}>
            <sphereGeometry args={[1.35, 14, 12]} />
            <meshStandardMaterial color={spec.leaf} roughness={0.85} />
          </mesh>
          <mesh position={[0.7, 2.2, 0.3]} scale={[1, 0.8, 1]}>
            <sphereGeometry args={[0.8, 12, 10]} />
            <meshStandardMaterial color="#74c85a" roughness={0.85} />
          </mesh>
        </group>
      ))}

      <primitive object={built.portals} />
      {built.railings.map((r) => (
        <primitive key={`railing${r.side}`} object={r.mesh} />
      ))}
      {built.kitMeshes.map(({ kit, mesh }) => (
        <primitive key={kit.key} object={mesh} />
      ))}
      {built.aspects && <primitive object={built.aspects} />}
      <primitive object={built.lamps} />

      {/* Rails en volume : à contre-jour ce sont les deux seules lignes
          brillantes du paysage, et une texture plate ne les rend pas. La gare
          pose déjà ceux de la voie d'en face — même profil, même altitude. */}
      {([-1, 1] as const).map((s) => (
        <mesh key={`rail${s}`} position={[s * GAUGE_HALF, -1.11, 0]} material={built.railMat}>
          <boxGeometry args={[0.08, 0.16, PLANE_LEN]} />
        </mesh>
      ))}

      {/* Plate-forme : ballast, traverses, rails, caniveaux à câbles */}
      <mesh position={[0, RAIL_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={built.bedMat}>
        <planeGeometry args={[TRACK_BED_WIDTH, PLANE_LEN]} />
      </mesh>
    </group>
  );
}
