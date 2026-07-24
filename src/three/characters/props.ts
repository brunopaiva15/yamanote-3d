// Accessoires « Tokyo » superposés aux personnages librairie : lunettes,
// masque chirurgical, sacs. Les modèles des packs n'en ont pas — on attache de
// petits volumes à des groupes « suiveurs » recalés chaque frame sur la
// transformation monde des os (tête, buste), en unités normalisées (le
// personnage fait SKELETON_TOP=1.445 unités, comme l'ancien squelette).
//
// Les accessoires sont MODELÉS (coque bombée et plissée pour le masque,
// sangles, poches et rabats pour les sacs) plutôt que de simples boîtes.
// Toutes les géométries sont transformées « en dur » à la construction du
// module et partagées entre les PNJ ; seuls les matériaux teintés (couleur de
// sac) sont créés par passager.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Appearance } from '../../systems/appearance';
import type { BoneMap } from './library';

export interface PropRig {
  headFollow: THREE.Group | null;
  spineFollow: THREE.Group | null;
}

// Assombrit une couleur hex — accents des sacs (sangles, rabats, poches).
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - k));
  const g = Math.round(((n >> 8) & 255) * (1 - k));
  const b = Math.round((n & 255) * (1 - k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Cylindre fin orienté d'un point A à un point B (élastiques, bandoulières),
// transformé dans la géométrie pour rester partageable entre tous les PNJ.
function tube(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): THREE.BufferGeometry {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const geo = new THREE.CylinderGeometry(r, r, d.length(), 6);
  geo.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(ax + d.x / 2, ay + d.y / 2, az + d.z / 2),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
      new THREE.Vector3(1, 1, 1),
    ),
  );
  return geo;
}

// --- Lunettes --------------------------------------------------------------

const glassesMat = new THREE.MeshStandardMaterial({ color: '#22201e', roughness: 0.4 });
const lensGeo = new THREE.BoxGeometry(0.055, 0.04, 0.012);
const bridgeGeo = new THREE.BoxGeometry(0.03, 0.008, 0.012);
const templeGeo = new THREE.BoxGeometry(0.008, 0.008, 0.1);

// Position des yeux / du bas du visage par rapport à l'origine de l'os de
// tête (base du crâne), en unités normalisées — vaut pour des proportions
// humaines standard après normalisation.
const EYE_Y = 0.09;
const FACE_Z = 0.1;

function makeGlasses(): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(lensGeo, glassesMat);
    lens.position.set(s * 0.045, 0, 0);
    g.add(lens);
    const temple = new THREE.Mesh(templeGeo, glassesMat);
    temple.position.set(s * 0.075, 0.005, -0.05);
    g.add(temple);
  }
  const bridge = new THREE.Mesh(bridgeGeo, glassesMat);
  g.add(bridge);
  g.position.set(0, EYE_Y, FACE_Z);
  return g;
}

// --- Masque chirurgical ----------------------------------------------------
// Coque bombée qui épouse le bas du visage : dôme sphérique aplati (pôle
// tourné vers +Z), trois plis horizontaux en arcs de tore posés sur la coque,
// barrette nasale sur l'arête haute et élastiques fins vers les oreilles.

const maskMat = new THREE.MeshStandardMaterial({ color: '#eef2f0', roughness: 0.9, side: THREE.DoubleSide });
const maskShellGeo = new THREE.SphereGeometry(0.066, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
maskShellGeo.rotateX(Math.PI / 2);
maskShellGeo.scale(1, 0.82, 0.62);
function pleatGeo(radius: number): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(radius, 0.0035, 5, 14, Math.PI * 0.8);
  geo.rotateZ(Math.PI * 0.1); // centre l'arc sur +Y…
  geo.rotateX(Math.PI / 2); // …puis le rabat vers +Z : anneau horizontal frontal
  geo.scale(1, 1, 0.62); // même aplatissement que la coque
  return geo;
}
const maskPleatMidGeo = pleatGeo(0.064);
const maskPleatEdgeGeo = pleatGeo(0.058);
const maskNoseGeo = new THREE.BoxGeometry(0.036, 0.006, 0.016);
maskNoseGeo.rotateX(-0.55);
maskNoseGeo.translate(0, 0.042, 0.026);
const maskLoopGeoL = tube(-0.058, 0.002, 0.008, -0.088, 0.048, -0.068, 0.0028);
const maskLoopGeoR = tube(0.058, 0.002, 0.008, 0.088, 0.048, -0.068, 0.0028);

function makeMask(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(maskShellGeo, maskMat));
  g.add(new THREE.Mesh(maskPleatMidGeo, maskMat));
  for (const s of [-1, 1]) {
    const pleat = new THREE.Mesh(maskPleatEdgeGeo, maskMat);
    pleat.position.y = s * 0.021;
    g.add(pleat);
  }
  g.add(new THREE.Mesh(maskNoseGeo, maskMat));
  g.add(new THREE.Mesh(maskLoopGeoL, maskMat));
  g.add(new THREE.Mesh(maskLoopGeoR, maskMat));
  g.position.set(0, EYE_Y - 0.075, FACE_Z - 0.038);
  return g;
}

// --- Sacs ------------------------------------------------------------------
// Sac à dos : corps arrondi + rabat supérieur, poche frontale, poignée de
// portage et deux sangles aplaties qui passent par-dessus les épaules.
// Sac bandoulière : besace à rabat sur la hanche, sangle en travers du buste.
// Sac à main : petit cabas tenu bas, avec anse.

const bpBodyGeo = new RoundedBoxGeometry(0.23, 0.3, 0.13, 3, 0.05);
const bpLidGeo = new RoundedBoxGeometry(0.235, 0.085, 0.135, 2, 0.03);
const bpPocketGeo = new RoundedBoxGeometry(0.16, 0.13, 0.05, 2, 0.025);
const bpHandleGeo = new THREE.TorusGeometry(0.026, 0.006, 5, 10, Math.PI);
const bpStrapGeo = new THREE.TorusGeometry(0.1, 0.011, 5, 14, Math.PI);
bpStrapGeo.scale(1, 1, 1.8); // tube aplati façon sangle
bpStrapGeo.rotateY(Math.PI / 2); // arc dans le plan YZ : passe par-dessus l'épaule

const sbBodyGeo = new RoundedBoxGeometry(0.17, 0.12, 0.06, 3, 0.028);
const sbFlapGeo = new RoundedBoxGeometry(0.172, 0.07, 0.064, 2, 0.02);
const sbStrapFrontGeo = tube(0.175, 0.05, 0.07, -0.055, 0.28, 0.05, 0.007);
const sbStrapBackGeo = tube(0.175, 0.05, -0.015, -0.055, 0.28, -0.075, 0.007);

const hbBodyGeo = new RoundedBoxGeometry(0.15, 0.11, 0.055, 3, 0.025);
const hbHandleGeo = new THREE.TorusGeometry(0.032, 0.005, 5, 10, Math.PI);

function bagMats(color: string): [THREE.Material, THREE.Material] {
  return [
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: shade(color, 0.32), roughness: 0.65 }),
  ];
}

function makeBackpack(color: string): THREE.Group {
  const g = new THREE.Group();
  const [body, trim] = bagMats(color);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(bpBodyGeo, body, 0, 0.15, -0.13);
  add(bpLidGeo, trim, 0, 0.2575, -0.13);
  add(bpPocketGeo, trim, 0, 0.08, -0.185);
  add(bpHandleGeo, trim, 0, 0.3, -0.13);
  for (const s of [-1, 1]) {
    add(bpStrapGeo, trim, s * 0.09, 0.205, -0.03);
  }
  return g;
}

function makeShoulderBag(color: string): THREE.Group {
  const g = new THREE.Group();
  const [body, trim] = bagMats(color);
  const bag = new THREE.Mesh(sbBodyGeo, body);
  bag.position.set(0.19, 0, 0.03);
  g.add(bag);
  const flap = new THREE.Mesh(sbFlapGeo, trim);
  flap.position.set(0.19, 0.028, 0.03);
  g.add(flap);
  g.add(new THREE.Mesh(sbStrapFrontGeo, trim));
  g.add(new THREE.Mesh(sbStrapBackGeo, trim));
  return g;
}

function makeHandBag(color: string): THREE.Group {
  const g = new THREE.Group();
  const [body, trim] = bagMats(color);
  const bag = new THREE.Mesh(hbBodyGeo, body);
  bag.position.set(0.22, -0.09, 0.03);
  g.add(bag);
  const handle = new THREE.Mesh(hbHandleGeo, trim);
  handle.position.set(0.22, -0.035, 0.03);
  g.add(handle);
  return g;
}

// Attache les accessoires du descripteur d'apparence ; renvoie les groupes
// suiveurs à recaler chaque frame via updatePropRig. `allowBag` : false quand
// le modèle a déjà son propre sac (évite le doublon).
export function attachProps(wrap: THREE.Group, app: Appearance, allowBag = true): PropRig {
  const rig: PropRig = { headFollow: null, spineFollow: null };

  if (app.glasses || app.mask) {
    const head = new THREE.Group();
    head.matrixAutoUpdate = false;
    if (app.glasses) head.add(makeGlasses());
    if (app.mask) head.add(makeMask());
    wrap.add(head);
    rig.headFollow = head;
  }

  if (allowBag && (app.bag === 'backpack' || app.bag === 'shoulder' || app.bag === 'hand')) {
    const spine = new THREE.Group();
    spine.matrixAutoUpdate = false;
    if (app.bag === 'backpack') spine.add(makeBackpack(app.bagColor));
    else if (app.bag === 'shoulder') spine.add(makeShoulderBag(app.bagColor));
    else spine.add(makeHandBag(app.bagColor));
    wrap.add(spine);
    rig.spineFollow = spine;
  }

  return rig;
}

const mInv = new THREE.Matrix4();
const mRel = new THREE.Matrix4();
const vPos = new THREE.Vector3();
const qRot = new THREE.Quaternion();
const vScl = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

function followBone(follow: THREE.Group | null, bone: THREE.Bone | undefined, wrap: THREE.Group): void {
  if (!follow || !bone) return;
  bone.updateWorldMatrix(true, false);
  mInv.copy(wrap.matrixWorld).invert();
  mRel.multiplyMatrices(mInv, bone.matrixWorld);
  // L'échelle de normalisation du modèle est neutralisée : les accessoires
  // sont dessinés en unités normalisées, quelle que soit la taille brute du GLB.
  mRel.decompose(vPos, qRot, vScl);
  follow.matrix.compose(vPos, qRot, ONE);
  follow.matrixWorldNeedsUpdate = true;
}

// Recale les groupes suiveurs sur les os (à appeler après les overrides).
// `bagVisible` : les sacs sont posés pour la station debout — on les masque
// quand le passager est assis (sinon le sac flotte à côté de lui).
export function updatePropRig(rig: PropRig, bones: BoneMap, wrap: THREE.Group, bagVisible: boolean): void {
  followBone(rig.headFollow, bones.head, wrap);
  if (rig.spineFollow) {
    rig.spineFollow.visible = bagVisible;
    if (bagVisible) followBone(rig.spineFollow, bones.spine, wrap);
  }
}
