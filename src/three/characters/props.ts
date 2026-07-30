// Accessoires « Tokyo » superposés aux personnages librairie : lunettes,
// masque chirurgical, sacs, téléphone. Les modèles des packs n'en ont pas -
// on attache de petits volumes à des groupes « suiveurs » recalés chaque
// frame sur la transformation monde des os (tête, buste, main), en unités
// normalisées (le personnage fait SKELETON_TOP=1.445 unités, comme l'ancien
// squelette).
//
// Les accessoires sont MODELÉS (coque bombée et plissée pour le masque,
// sangles, poches et rabats pour les sacs, coque + écran pour le téléphone)
// plutôt que de simples boîtes. Toutes les géométries sont transformées « en
// dur » à la construction du module et partagées entre les PNJ ; seuls les
// matériaux teintés (couleur de sac) sont créés par passager.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Appearance } from '../../systems/appearance';
import { markOwned, type BoneMap } from './library';
import type { PaxAction } from '../../data/paxActions';
import { ACTION_BY_ID } from '../../data/paxActions';

export interface PropRig {
  headFollow: THREE.Group | null;
  spineFollow: THREE.Group | null;
  handFollow: THREE.Group | null; // objet tenu, recalé sur la main
  phoneR: THREE.Group | null;
  phoneL: THREE.Group | null;
  book: THREE.Group | null;
  bottle: THREE.Group | null;
  map: THREE.Group | null;
  ticket: THREE.Group | null;
}

/** Quelle prop main afficher pour une action (ou null). */
export function handPropFor(action: PaxAction): 'phone' | 'book' | 'bottle' | 'map' | 'ticket' | null {
  return ACTION_BY_ID.get(action)?.handProp ?? null;
}

/**
 * Pose bras « objet tenu » (téléphone / livre / bouteille / plan / ticket).
 *
 * C'est aussi ce qui autorise l'affichage de l'objet : un `handProp` absent
 * d'ici ne sort jamais de la main. Le ticket manquait - `ticketGlance` levait
 * donc le regard sur un billet invisible.
 */
export function usesHeldPose(action: PaxAction): boolean {
  return handPropFor(action) !== null || action === 'sharePhone';
}

// Assombrit une couleur hex - accents des sacs (sangles, rabats, poches).
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
// tête (base du crâne), en unités normalisées - vaut pour des proportions
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

// Seuls matériaux créés par voyageur (tout le reste est partagé) : marqués,
// donc libérés avec le clone quand le slot change d'identité (library.ts).
function bagMats(color: string): [THREE.Material, THREE.Material] {
  return [
    markOwned(new THREE.MeshStandardMaterial({ color, roughness: 0.85 })),
    markOwned(new THREE.MeshStandardMaterial({ color: shade(color, 0.32), roughness: 0.65 })),
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

// --- Téléphone -------------------------------------------------------------
// Smartphone tenu dans la paume : coque sombre + dalle légèrement émissive.
// La pose téléphone (characters/pose.ts) impose l'orientation MONDE de la
// main - la prise est donc réglée une fois pour toutes dans le repère de
// l'os de main (+Y poignet → doigts, +Z côté paume, rigs Quaternius).

const phoneBodyGeo = new RoundedBoxGeometry(0.042, 0.082, 0.009, 2, 0.004);
const phoneScreenGeo = new THREE.BoxGeometry(0.034, 0.066, 0.0012);
const phoneBodyMat = new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.45, metalness: 0.25 });
const phoneScreenMat = new THREE.MeshStandardMaterial({
  color: '#7a96b0',
  roughness: 0.28,
  metalness: 0.05,
  emissive: '#243848',
  emissiveIntensity: 0.45,
});

// Prise MAIN DROITE réglée à la main (probe ?grip=) : téléphone couché en
// diagonale DANS la paume - côté -Z de l'os (la paume, +Z étant le dos de la
// main), écran retourné vers l'extérieur de la paume (Ry ≈ π), incliné vers
// le visage. Légèrement surdimensionné pour les mains stylisées des packs.
const PHONE_GRIP_POS = new THREE.Vector3(0, 0.09, -0.022);
const PHONE_GRIP_ROT = new THREE.Euler(0.15, Math.PI, 0.3);
const PHONE_GRIP_SCALE = 1.28;

// `side` : 1 = prise droite, -1 = prise gauche. La gauche est le MIROIR
// SAGITTAL exact de la droite - licite parce que pose.ts force les
// orientations monde des deux mains à être miroirs l'une de l'autre : dans le
// repère de l'os, le miroir s'écrit position (-x, y, z) et quaternion
// (x, -y, -z, w), la coque du téléphone étant symétrique sur son axe x.
function makePhone(side: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(phoneBodyGeo, phoneBodyMat));
  const screen = new THREE.Mesh(phoneScreenGeo, phoneScreenMat);
  screen.position.z = 0.0052;
  g.add(screen);
  g.position.copy(PHONE_GRIP_POS);
  g.quaternion.setFromEuler(PHONE_GRIP_ROT);
  g.scale.setScalar(PHONE_GRIP_SCALE);
  if (side === -1) {
    g.position.x *= -1;
    g.quaternion.set(g.quaternion.x, -g.quaternion.y, -g.quaternion.z, g.quaternion.w);
  }
  return g;
}

// --- Livre / bouteille / plan / ticket (props tenus, partagés) -------------

const bookMat = new THREE.MeshStandardMaterial({ color: '#6a4a38', roughness: 0.85 });
const bookPageMat = new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.95 });
const bookBodyGeo = new RoundedBoxGeometry(0.07, 0.095, 0.014, 1, 0.003);
const bookPageGeo = new THREE.BoxGeometry(0.062, 0.088, 0.002);

function makeBook(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bookBodyGeo, bookMat));
  const page = new THREE.Mesh(bookPageGeo, bookPageMat);
  page.position.z = 0.008;
  g.add(page);
  g.position.copy(PHONE_GRIP_POS);
  g.quaternion.setFromEuler(new THREE.Euler(0.25, Math.PI, 0.15));
  g.scale.setScalar(1.15);
  return g;
}

const bottleMat = new THREE.MeshStandardMaterial({ color: '#3a7a9a', roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.85 });
const bottleCapMat = new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.5 });
const bottleBodyGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.09, 8);
const bottleNeckGeo = new THREE.CylinderGeometry(0.009, 0.012, 0.028, 6);
const bottleCapGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.01, 6);

function makeBottle(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bottleBodyGeo, bottleMat);
  body.position.y = 0.02;
  g.add(body);
  const neck = new THREE.Mesh(bottleNeckGeo, bottleMat);
  neck.position.y = 0.075;
  g.add(neck);
  const cap = new THREE.Mesh(bottleCapGeo, bottleCapMat);
  cap.position.y = 0.095;
  g.add(cap);
  g.position.set(0, 0.08, -0.02);
  g.quaternion.setFromEuler(new THREE.Euler(0.35, 0, 0.2));
  return g;
}

const mapMat = new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.9, side: THREE.DoubleSide });
const mapLineMat = new THREE.MeshStandardMaterial({ color: '#c94f42', roughness: 0.8 });
const mapGeo = new THREE.PlaneGeometry(0.1, 0.08);
const mapFoldGeo = new THREE.PlaneGeometry(0.05, 0.08);

function makeMap(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mapGeo, mapMat));
  const fold = new THREE.Mesh(mapFoldGeo, mapLineMat);
  fold.position.set(0.03, 0, 0.001);
  fold.rotation.y = 0.15;
  g.add(fold);
  g.position.copy(PHONE_GRIP_POS);
  g.quaternion.setFromEuler(new THREE.Euler(0.4, Math.PI, 0.1));
  g.scale.setScalar(1.1);
  return g;
}

const ticketMat = new THREE.MeshStandardMaterial({ color: '#f0ebe0', roughness: 0.95 });
const ticketStripeMat = new THREE.MeshStandardMaterial({ color: '#3a5a8a', roughness: 0.8 });
const ticketGeo = new RoundedBoxGeometry(0.045, 0.028, 0.002, 1, 0.001);
const ticketStripeGeo = new THREE.BoxGeometry(0.045, 0.006, 0.0022);

function makeTicket(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ticketGeo, ticketMat));
  const stripe = new THREE.Mesh(ticketStripeGeo, ticketStripeMat);
  stripe.position.y = 0.006;
  g.add(stripe);
  g.position.copy(PHONE_GRIP_POS);
  g.quaternion.setFromEuler(new THREE.Euler(0.2, Math.PI, 0.25));
  g.scale.setScalar(1.2);
  return g;
}

// Attache les accessoires du descripteur d'apparence ; renvoie les groupes
// suiveurs à recaler chaque frame via updatePropRig. `allowBag` : false quand
// le modèle a déjà son propre sac (évite le doublon). Les objets tenus
// (téléphone, livre, bouteille, plan, ticket) sont toujours créés masqués.
export function attachProps(wrap: THREE.Group, app: Appearance, allowBag = true): PropRig {
  const rig: PropRig = {
    headFollow: null,
    spineFollow: null,
    handFollow: null,
    phoneR: null,
    phoneL: null,
    book: null,
    bottle: null,
    map: null,
    ticket: null,
  };

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

  const hand = new THREE.Group();
  hand.matrixAutoUpdate = false;
  hand.visible = false;
  rig.phoneR = makePhone(1);
  rig.phoneL = makePhone(-1);
  rig.phoneL.visible = false;
  rig.book = makeBook();
  rig.book.visible = false;
  rig.bottle = makeBottle();
  rig.bottle.visible = false;
  rig.map = makeMap();
  rig.map.visible = false;
  rig.ticket = makeTicket();
  rig.ticket.visible = false;
  hand.add(rig.phoneR);
  hand.add(rig.phoneL);
  hand.add(rig.book);
  hand.add(rig.bottle);
  hand.add(rig.map);
  hand.add(rig.ticket);
  wrap.add(hand);
  rig.handFollow = hand;

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
// `bagVisible` : les sacs sont posés pour la station debout - on les masque
// quand le passager est assis (sinon le sac flotte à côté de lui).
// `handProp` : objet tenu (téléphone, livre, bouteille, plan, ticket).
// `phoneSide` : main qui le tient (PoseState.phoneSide) - la gauche quand la
// droite est déjà à la poignée.
export function updatePropRig(
  rig: PropRig,
  bones: BoneMap,
  wrap: THREE.Group,
  bagVisible: boolean,
  handProp: 'phone' | 'book' | 'bottle' | 'map' | 'ticket' | null = null,
  phoneSide: 1 | -1 = 1,
): void {
  followBone(rig.headFollow, bones.head, wrap);
  if (rig.spineFollow) {
    rig.spineFollow.visible = bagVisible;
    if (bagVisible) followBone(rig.spineFollow, bones.spine, wrap);
  }
  if (rig.handFollow) {
    const show = handProp !== null;
    rig.handFollow.visible = show;
    if (show) {
      const right = phoneSide !== -1;
      const handBone = right
        ? (bones.handR ?? bones.foreArmR ?? bones.handL ?? bones.foreArmL)
        : (bones.handL ?? bones.foreArmL ?? bones.handR ?? bones.foreArmR);
      if (rig.phoneR) rig.phoneR.visible = handProp === 'phone' && right;
      if (rig.phoneL) rig.phoneL.visible = handProp === 'phone' && !right;
      if (rig.book) {
        // Livre / plan / ticket / bouteille : une seule prise (droite par défaut).
        rig.book.visible = handProp === 'book';
      }
      if (rig.bottle) rig.bottle.visible = handProp === 'bottle';
      if (rig.map) rig.map.visible = handProp === 'map';
      if (rig.ticket) rig.ticket.visible = handProp === 'ticket';
      followBone(rig.handFollow, handBone, wrap);
    }
  }
}
