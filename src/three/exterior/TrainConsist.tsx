// La rame vue de dehors : onze caisses E235-0, de la cabine de tête à celle de
// queue.
//
// Rien de tout ceci n'est visible depuis l'intérieur du wagon — les baies
// regardent perpendiculairement à la caisse et le hublot d'intercirculation
// donne sur une plaque sombre. Le groupe entier reste donc éteint tant que le
// joueur est à bord d'une rame à l'arrêt : coût nul en jeu normal.
//
// Chaque matériau ne fait qu'un seul InstancedMesh de onze instances : la rame
// complète tient en une vingtaine d'appels de rendu.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONSIST, E235, LIVERY, PLAYER_CAR, carZ } from '../../data/e235';
import { useStore } from '../../store';
import { runtime } from '../../systems/runtime';
import { trainDoorLag, trainDoorPos } from '../../systems/doorMotion';
import { consistDetail } from '../../systems/perf';
import {
  makeBellowsTexture,
  makeBogieTexture,
  makeCarPlateTexture,
  makeDestinationSign,
  makeFrontCheckerTexture,
  makeRoofTexture,
  makeStainlessRoughness,
  makeStainlessTexture,
  serviceNumberFor,
} from '../../textures/trainExterior';
import { applyShadowFlags } from '../shadowFlags';
import { buildCarGeometries, buildPantograph } from './carShellGeometry';
import { buildCab } from './cabGeometry';

const CARS = CONSIST.length;
/** Nombre de vantaux extérieurs : 11 voitures × 4 portes × 2 côtés × 2 vantaux. */
const LEAVES = CARS * E235.doorCenters.length * 4;

interface Built {
  root: THREE.Group;
  leaves: THREE.InstancedMesh;
  leafGlass: THREE.InstancedMesh;
  sign: { texture: THREE.CanvasTexture; redraw: (s: string) => void };
  dispose: () => void;
}

const LEAF_MATRIX = new THREE.Matrix4();
const GLASS_MATRIX = new THREE.Matrix4();
/** Demi-tour appliqué aux hublots du côté −x : leur décalage part vers +x. */
const GLASS_FLIP = new THREE.Matrix4().makeRotationY(Math.PI);

/**
 * Repose les 176 vantaux extérieurs. `open` est la course de la porte de
 * référence, `side` le côté qui s'ouvre — l'autre reste fermé, comme à
 * l'intérieur.
 */
function layoutLeaves(built: Built, side: 1 | -1, open: boolean): void {
  let k = 0;
  for (let i = 0; i < CARS; i++) {
    const cz = carZ(i);
    for (const dz of E235.doorCenters) {
      const slide = open ? trainDoorPos(trainDoorLag(dz)) * E235.doorHalfW : 0;
      for (const s of [1, -1] as const) {
        const shift = s === side ? slide : 0;
        for (const dir of [1, -1] as const) {
          LEAF_MATRIX.makeTranslation(
            s * (E235.halfWidth + 0.03),
            0,
            cz + dz + dir * (E235.doorHalfW / 2 + shift),
          );
          built.leaves.setMatrixAt(k, LEAF_MATRIX);
          // Le hublot est modélisé en saillie vers +x : sur le flanc opposé il
          // faut le retourner, faute de quoi il s'enfonce dans le vantail et
          // regarde l'intérieur de la rame.
          GLASS_MATRIX.copy(LEAF_MATRIX);
          if (s === -1) GLASS_MATRIX.multiply(GLASS_FLIP);
          built.leafGlass.setMatrixAt(k, GLASS_MATRIX);
          k++;
        }
      }
    }
  }
  built.leaves.instanceMatrix.needsUpdate = true;
  built.leafGlass.instanceMatrix.needsUpdate = true;
}

function tiled(tex: THREE.Texture, k: number): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(k, k);
  return tex;
}

function build(): Built {
  const root = new THREE.Group();
  const geos = buildCarGeometries();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  // --- Matériaux ---
  const stainless = track(tiled(makeStainlessTexture(), 0.5));
  const stainlessRough = track(tiled(makeStainlessRoughness(), 0.5));
  const roofTex = track(tiled(makeRoofTexture(), 0.5));
  const bogieTex = track(makeBogieTexture());
  const bellowsTex = track(makeBellowsTexture());
  const checkerTex = track(makeFrontCheckerTexture());
  const sign = makeDestinationSign();
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
    band: track(new THREE.MeshStandardMaterial({ color: LIVERY.uguisu, roughness: 0.52 })),
    roof: track(
      new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.9, metalness: 0.12 }),
    ),
    underframe: track(
      new THREE.MeshStandardMaterial({ color: LIVERY.underframe, roughness: 0.86 }),
    ),
    bogie: track(
      new THREE.MeshStandardMaterial({ map: bogieTex, roughness: 0.72, metalness: 0.35 }),
    ),
    glass: track(
      new THREE.MeshStandardMaterial({
        color: LIVERY.glass,
        roughness: 0.07,
        metalness: 0.35,
        transparent: true,
        // Assez transparent pour qu'on distingue les voyageurs derrière : c'est
        // ce que montrent les photos, et c'est ce qui fait qu'une rame à quai
        // n'a pas l'air vide.
        opacity: 0.58,
      }),
    ),
    liner: track(
      new THREE.MeshStandardMaterial({
        color: '#767b80',
        roughness: 0.95,
        side: THREE.BackSide,
      }),
    ),
    leaf: track(new THREE.MeshStandardMaterial({ color: LIVERY.uguisu, roughness: 0.48 })),
    bellows: track(
      new THREE.MeshStandardMaterial({ map: bellowsTex, color: '#25282c', roughness: 0.95 }),
    ),
    black: track(new THREE.MeshStandardMaterial({ color: LIVERY.black, roughness: 0.22, metalness: 0.1 })),
    checker: track(
      new THREE.MeshBasicMaterial({ map: checkerTex, transparent: true, toneMapped: false }),
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
    metal: track(new THREE.MeshStandardMaterial({ color: '#7d838a', roughness: 0.42, metalness: 0.6 })),
    insulator: track(new THREE.MeshStandardMaterial({ color: '#5c4a3a', roughness: 0.7 })),
  };

  // --- Une instance par voiture, pour chaque matériau ---
  const m = new THREE.Matrix4();
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number) => {
    track(geo);
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    root.add(im);
    return im;
  };

  for (const [geo, mat] of [
    [geos.body, mats.body],
    [geos.band, mats.band],
    [geos.roof, mats.roof],
    [geos.underframe, mats.underframe],
    [geos.bogies, mats.bogie],
    [geos.glass, mats.glass],
  ] as const) {
    const im = instanced(geo, mat, CARS);
    for (let i = 0; i < CARS; i++) im.setMatrixAt(i, m.makeTranslation(0, 0, carZ(i)));
    im.instanceMatrix.needsUpdate = true;
  }

  // Doublures : toutes les voitures sauf celle du joueur, qui a un vrai
  // intérieur.
  const liner = instanced(geos.liner, mats.liner, CARS - 1);
  {
    let k = 0;
    for (let i = 0; i < CARS; i++) {
      if (i === PLAYER_CAR) continue;
      liner.setMatrixAt(k++, m.makeTranslation(0, 0, carZ(i)));
    }
    liner.instanceMatrix.needsUpdate = true;
  }

  // Soufflets d'intercirculation.
  const bellows = instanced(geos.bellows, mats.bellows, CARS - 1);
  for (let i = 0; i < CARS - 1; i++) {
    bellows.setMatrixAt(i, m.makeTranslation(0, 0, carZ(i) + E235.pitch / 2));
  }
  bellows.instanceMatrix.needsUpdate = true;

  // Vantaux extérieurs : matrices réécrites à chaque frame d'ouverture.
  const leaves = instanced(geos.doorLeaf, mats.leaf, LEAVES);
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const leafGlass = instanced(geos.doorGlass, mats.glass, LEAVES);
  leafGlass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Cabines : le même nez aux deux bouts, celui de queue retourné.
  for (const [i, dir] of [
    [0, -1],
    [CARS - 1, 1],
  ] as const) {
    const cab = buildCab({ ...mats, green: mats.band });
    cab.position.z = carZ(i);
    if (dir === -1) cab.rotation.y = Math.PI;
    root.add(cab);
  }

  // Pantographes.
  for (let i = 0; i < CARS; i++) {
    if (!CONSIST[i].panto) continue;
    const p = buildPantograph({ metal: mats.metal, insulator: mats.insulator });
    p.position.z = carZ(i) + 5.6;
    root.add(p);
  }

  // Plaques de numéro de voiture, en bas de caisse près de chaque about.
  for (let i = 0; i < CARS; i++) {
    const tex = track(makeCarPlateTexture(CONSIST[i].no, CONSIST[i].label));
    const mat = track(
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }),
    );
    for (const s of [1, -1] as const) {
      const geo = track(new THREE.PlaneGeometry(0.5, 0.25));
      geo.rotateY((s * Math.PI) / 2);
      geo.translate(s * (E235.halfWidth + 0.01), 0.42, carZ(i) - s * 8.9);
      root.add(new THREE.Mesh(geo, mat));
    }
  }

  applyShadowFlags(root);
  root.visible = false;
  root.userData.consist = true;
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__consist = root;
  }

  const built: Built = {
    root,
    leaves,
    leafGlass,
    sign,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
  // Portes fermées d'emblée : sans cette pose initiale, un palier de qualité
  // qui fige l'animation laisserait les 176 vantaux empilés à l'origine.
  layoutLeaves(built, 1, false);
  return built;
}

export function TrainConsist() {
  const built = useMemo(build, []);
  const lastOpen = useRef(-1);
  const lastService = useRef('');

  useFrame(() => {
    // Éteinte tant qu'on est à bord d'une rame immobile : depuis l'intérieur,
    // on ne voit jamais sa propre caisse.
    const visible = runtime.playerFrame === 'platform' || runtime.trainZ !== 0;
    built.root.visible = visible;
    if (!visible) return;

    const { doorSide, index } = useStore.getState();

    // Girouette : numéro de course, recalculé quand il change seulement.
    const service = serviceNumberFor(index, runtime.clockMin);
    if (service !== lastService.current) {
      lastService.current = service;
      built.sign.redraw(service);
    }

    // Vantaux : seul le côté quai coulisse, comme à l'intérieur. Aux paliers
    // de qualité bas, on ne rejoue plus l'animation mais on garde une pose
    // cohérente (portes ouvertes ou fermées, sans coulissement).
    const open = runtime.doorOpen;
    const stepped = consistDetail() >= 3 ? Math.round(open) : open;
    if (Math.abs(stepped - lastOpen.current) > 0.002) {
      lastOpen.current = stepped;
      layoutLeaves(built, doorSide, stepped > 0.01);
    }
  });

  return <primitive object={built.root} />;
}
