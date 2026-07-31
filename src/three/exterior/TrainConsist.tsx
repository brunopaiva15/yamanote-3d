// La rame vue de dehors : onze caisses E235-0, de la cabine de tête à celle de
// queue.
//
// Rien de tout ceci n'est visible depuis l'intérieur du wagon - les baies
// regardent perpendiculairement à la caisse et le hublot d'intercirculation
// donne sur une plaque sombre. Le groupe entier reste donc éteint tant que le
// joueur est à bord d'une rame à l'arrêt : coût nul en jeu normal.
//
// Chaque matériau ne fait qu'un seul InstancedMesh de onze instances : la rame
// complète tient en une vingtaine d'appels de rendu.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DOOR_POCKET_TUCK } from '../../data/config';
import { CONSIST, E235, LIVERY, PLAYER_CAR, carZ } from '../../data/e235';
import { useStore } from '../../store';
import { runtime } from '../../systems/runtime';
import { blockedDoorOpen, trainDoorPosAt } from '../../systems/doorMotion';
import { consistDetail } from '../../systems/perf';
import {
  makeBellowsTexture,
  makeBogieTexture,
  makeCarPlateTexture,
  makeDestinationSign,
  makeFrontCheckerTexture,
  makeRoofTexture,
  makeSideSign,
  type SideSignView,
  makeStainlessRoughness,
  makeStainlessTexture,
  serviceNumberFor,
} from '../../textures/trainExterior';
import { applyShadowFlags } from '../shadowFlags';
import { buildCarGeometries, buildPantograph, buildRoofCables } from './carShellGeometry';
import { buildCab } from './cabGeometry';

const CARS = CONSIST.length;
/** Nombre de vantaux extérieurs : 11 voitures × 4 portes × 2 côtés × 2 vantaux. */
const LEAVES = CARS * E235.doorCenters.length * 4;

interface Built {
  root: THREE.Group;
  leaves: THREE.InstancedMesh;
  leafGlass: THREE.InstancedMesh;
  sign: { texture: THREE.CanvasTexture; redraw: (s: string) => void };
  sideSign: { texture: THREE.CanvasTexture; redraw: (index: number, direction: import('../../data/platforms').LoopDirection, view: SideSignView) => void };
  dispose: () => void;
}

const LEAF_MATRIX = new THREE.Matrix4();
const GLASS_MATRIX = new THREE.Matrix4();
/** Demi-tour appliqué aux hublots du côté −x : leur décalage part vers +x. */
const GLASS_FLIP = new THREE.Matrix4().makeRotationY(Math.PI);

/**
 * Repose les 176 vantaux extérieurs. `open` est la course de la porte de
 * référence, `side` le côté qui s'ouvre - l'autre reste fermé, comme à
 * l'intérieur.
 */
function layoutLeaves(built: Built, side: 1 | -1, open: boolean): void {
  let k = 0;
  for (let i = 0; i < CARS; i++) {
    const cz = carZ(i);
    for (const dz of E235.doorCenters) {
      // Course + dépassement : en butée le chant du vantail se glisse derrière
      // le tableau de la porte percé dans la peau de caisse. Sans ces quelques
      // millimètres, les deux faces sont exactement confondues et le bout de la
      // porte clignote pendant tout l'arrêt (voir DOOR_POCKET_TUCK).
      // Porte par porte : depuis le quai, une porte bloquée sur une caisse
      // voisine se voit à ça - un seul intervalle resté ouvert sur quarante-quatre.
      const slide = open ? trainDoorPosAt(i, dz) * (E235.doorHalfW + DOOR_POCKET_TUCK) : 0;
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
  const sideSign = makeSideSign();
  track(sideSign.texture);

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
        // Crème d'habitacle, pas le gris technique : c'est le « plafond » et
        // les parois qu'on lit à travers les baies des voitures voisines.
        color: '#e2e1db',
        roughness: 0.92,
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
    sideSign: track(new THREE.MeshBasicMaterial({ map: sideSign.texture, toneMapped: false })),
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

  // Deux afficheurs par flanc et par voiture : un dans la baie qui précède la
  // porte 1, l'autre dans celle qui suit la porte 4. Le motif latéral complet
  // est donc bien afficheur–porte–baie–porte–baie–porte–baie–porte–afficheur.
  // Toutes les occurrences partagent le canvas et les deux matériaux.
  const sideSignCount = CARS * 4;
  // Cadre noir aux angles très arrondis et dalle 4:1, comme le boîtier encastré
  // visible sur les vraies E235 (et non un rectangle de signalétique de quai).
  const signBoxGeo = new RoundedBoxGeometry(1, 0.28, 0.055, 3, 0.075);
  signBoxGeo.rotateY(Math.PI / 2);
  const signBox = instanced(signBoxGeo, mats.black, sideSignCount);
  const signFaceGeo = new THREE.PlaneGeometry(0.9, 0.2);
  signFaceGeo.rotateY(Math.PI / 2);
  const signFaces = instanced(signFaceGeo, mats.sideSign, sideSignCount);
  let signIndex = 0;
  const END_SIGN_INSET = 0.9;
  const signOffsets = [
    E235.doorCenters[0] - END_SIGN_INSET,
    E235.doorCenters[E235.doorCenters.length - 1] + END_SIGN_INSET,
  ];
  for (let i = 0; i < CARS; i++) for (const s of [1, -1] as const) for (const dz of signOffsets) {
    // Le boîtier traverse la peau depuis l'intérieur : son centre est en retrait
    // dans la caisse. Seule la dalle dépasse de 3 mm, juste assez pour éviter
    // le z-fighting sans donner l'impression d'un panneau collé sur la rame.
    signBox.setMatrixAt(signIndex, m.makeTranslation(s * (E235.halfWidth - 0.025), 2.08, carZ(i) + dz));
    m.makeRotationY(s === 1 ? 0 : Math.PI);
    m.setPosition(s * (E235.halfWidth + 0.003), 2.08, carZ(i) + dz);
    signFaces.setMatrixAt(signIndex, m);
    signIndex++;
  }
  signBox.instanceMatrix.needsUpdate = true;
  signFaces.instanceMatrix.needsUpdate = true;

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

  // Pantographes et leur appareillage de toiture (conduits, isolateurs).
  for (let i = 0; i < CARS; i++) {
    if (!CONSIST[i].panto) continue;
    const p = buildPantograph({ metal: mats.metal, insulator: mats.insulator });
    p.position.z = carZ(i) + 5.6;
    root.add(p);
    const cables = buildRoofCables({ black: mats.black, metal: mats.metal, insulator: mats.insulator });
    cables.position.z = carZ(i);
    root.add(cables);
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
    sideSign,
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
  const lastBlocked = useRef(-1);
  const lastService = useRef('');
  const lastSideSign = useRef('');

  useFrame(() => {
    // Éteinte tant qu'on est à bord d'une rame immobile : depuis l'intérieur,
    // on ne voit jamais sa propre caisse.
    const visible = runtime.playerFrame === 'platform' || runtime.trainZ !== 0;
    built.root.visible = visible;
    if (!visible) return;

    const { doorSide, index, loopDirection } = useStore.getState();

    // Le temps simulé fournit un intervalle stable, indépendant du framerate.
    const views: SideSignView[] = ['line', 'japanese', 'english'];
    const sideView = views[Math.floor((runtime.clockMin * 60) / 5) % views.length];
    const sideKey = `${index}:${loopDirection}:${sideView}`;
    if (sideKey !== lastSideSign.current) {
      lastSideSign.current = sideKey;
      built.sideSign.redraw(index, loopDirection, sideView);
    }

    // Girouette : numéro de course, recalculé quand il change seulement.
    const service = serviceNumberFor(index, runtime.clockMin, loopDirection);
    if (service !== lastService.current) {
      lastService.current = service;
      built.sign.redraw(service);
    }

    // Vantaux : seul le côté quai coulisse, comme à l'intérieur. Aux paliers
    // de qualité bas, on ne rejoue plus l'animation mais on garde une pose
    // cohérente (portes ouvertes ou fermées, sans coulissement).
    const open = runtime.doorOpen;
    const stepped = consistDetail() >= 3 ? Math.round(open) : open;
    // Une porte bloquée bouge quand tout le reste est immobile : sa course doit
    // entrer dans le test, sans quoi la seule chose à voir serait figée.
    const blocked = blockedDoorOpen();
    if (
      Math.abs(stepped - lastOpen.current) > 0.002 ||
      Math.abs(blocked - lastBlocked.current) > 0.002
    ) {
      lastOpen.current = stepped;
      lastBlocked.current = blocked;
      layoutLeaves(built, doorSide, stepped > 0.01 || blocked > 0.01);
    }
  });

  return <primitive object={built.root} />;
}
