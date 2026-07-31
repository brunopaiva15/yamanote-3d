// Nez de cabine du E235-0 : le masque vert, sa ceinture noire, le pare-brise,
// le dégradé pointillé qui court dessous, la girouette LED, les blocs optiques
// et l'attelage. Construit pour l'extrémité +z d'une voiture ; la voiture de
// queue reçoit le même objet, retourné d'un demi-tour.
//
// Le masque n'est PAS une plaque extrudée : c'est un loft. On part de la
// section exacte de la caisse - flancs droits ET voûte de pavillon - on la
// prolonge telle quelle au-delà de l'about, et on ne la referme en quart
// d'ellipse que sur les vingt-cinq derniers centimètres. Le nez garde donc la
// largeur de la rame jusqu'au bord, où il roule d'un coup : c'est ce que
// montrent les photos de la série, une face franche, pas un cône.
//
// De là découle tout le reste : le CONTOUR VERT ÉPOUSE LA SECTION DE CAISSE, et
// la ceinture noire épouse le contour vert. Ni l'un ni l'autre n'est un
// rectangle - leur bord haut suit la voûte du pavillon. C'est `sectionShape`
// qui les découpe tous les deux dans le même profil, décalé vers l'intérieur.
//
// La face est plane et d'aplomb : rien n'est incliné, tout ce qui s'y pose
// tient en (x, y) à z = CAB_FRONT_Z.
//
// Toutes les pièces sont fusionnées par matériau : une cabine complète tient
// en une dizaine d'appels de rendu, pour quatre cabines dans la scène (deux
// pour notre rame, deux pour celle d'en face).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { E235 } from '../../data/e235';
import { roundedRect } from '../shapes';

/** Abscisse longitudinale de la face avant, en repère voiture. */
export const CAB_FRONT_Z = E235.bodyHalfLen + 0.6;

/**
 * Le masque avance de soixante centimètres au-delà de l'about, mais il ne se
 * resserre que sur les vingt-cinq derniers : jusque-là, il garde EXACTEMENT la
 * section de caisse.
 *
 * Ces deux cotes ne sont pas un détail de forme. Quand le resserrement courait
 * sur toute la saillie, la face était partout plus étroite que ce qu'il y avait
 * derrière : de trois quarts on voyait l'inox du flanc et le gris du pavillon
 * border le vert sur toute la hauteur, et le nez se lisait comme une boîte
 * rapportée. Resserré sur le seul bord, ce qui déborde de la face est le
 * masque lui-même - donc du vert, et la caisse ne réapparaît qu'à l'about.
 */
const STRAIGHT_TO = CAB_FRONT_Z - 0.25;
const ROLL = CAB_FRONT_Z - STRAIGHT_TO;

/**
 * Recouvrement du masque sur la caisse, et de combien il la déborde.
 *
 * Le masque passe PAR-DESSUS l'about, jamais dessous : le pavillon et la peau
 * de caisse sont fermés par des bouchons plats à z = ±9,8, et un masque en
 * retrait les laisse voir en tranche - une lame grise en travers du haut du
 * nez, très lisible depuis le quai. Trois millimètres de débord les enfouissent
 * et se lisent comme le joint de la pièce moulée. Le recouvrement reste court :
 * sur toute sa longueur, ce débord serait un anneau vert autour de la cabine.
 */
const TUCK = 0.05;
const OUTSET = 0.003;

export interface CabMaterials {
  /** Masque : uguisu chez nous, inox nu sur la rame d'en face. */
  green: THREE.Material;
  /** Ceinture noire de face avant, balais d'essuie-glace, boyaux. */
  black: THREE.Material;
  /** Vitrage de cabine : sombre et réfléchissant, pas le noir mat du masque. */
  windshield: THREE.Material;
  /** Dégradé sous le pare-brise (damier chez nous, aplat de ligne ailleurs). */
  checker: THREE.Material;
  sign: THREE.Material;
  headlight: THREE.Material;
  /** Le même bloc, éteint : c'est ce que porte la cabine de queue. */
  headlightOff: THREE.Material;
  taillight: THREE.Material;
  taillightOff: THREE.Material;
  underframe: THREE.Material;
  metal: THREE.Material;
}

export interface CabOptions {
  /**
   * Cabine de queue. Une rame n'allume ses phares qu'en tête et ses feux
   * rouges qu'en queue : c'est ce qui dit, depuis le quai, de quel côté elle
   * s'en va. Les deux blocs restent modelés des deux côtés - une lanterne
   * éteinte reste une lanterne.
   */
  tail?: boolean;
}

// --- Section de caisse ---------------------------------------------------

/**
 * Un profil de caisse vu de face : coins bas adoucis, flancs droits jusqu'aux
 * gouttières, voûte de pavillon au-dessus. Le loft interpole ces cinq cotes
 * entre l'about de caisse et la face avant ; `inset` en tire les contours de
 * la ceinture noire et du dégradé.
 */
interface Section {
  hw: number;
  yBot: number;
  /** Rayon des coins bas. */
  r: number;
  /** Gouttière : hauteur où le flanc droit cède la place à la voûte. */
  eaves: number;
  crown: number;
}

/**
 * À l'about : la section de caisse, coiffée de trois millimètres.
 *
 * Le bas s'arrête au ras du châssis. Il descendait plus bas au premier jet, et
 * comme le châssis de caisse s'arrête à l'about, le bord du masque pendait dans
 * le vide sous la traverse - une langue verte sous le nez, visible de tout le
 * quai.
 */
const BODY: Section = {
  hw: E235.halfWidth + OUTSET,
  yBot: E235.underframeY - 0.02,
  r: 0.12,
  eaves: E235.roofY - 0.04 + OUTSET,
  crown: E235.roofCrownY + OUTSET,
};

/**
 * À la face : la section de caisse rentrée d'une quinzaine de centimètres.
 *
 * C'est le rayon du bord, pas un fuseau : le resserrement se joue tout entier
 * sur les vingt-cinq derniers centimètres (voir STRAIGHT_TO), si bien que ce
 * qui borde la face avant, tout autour, est le masque lui-même.
 */
const FACE: Section = {
  hw: E235.halfWidth - 0.16,
  yBot: 0.06,
  r: 0.34,
  eaves: E235.roofY - 0.14,
  crown: E235.roofCrownY - 0.14,
};

function lerpSection(a: Section, b: Section, t: number): Section {
  const k = (u: number, v: number) => u + (v - u) * t;
  return {
    hw: k(a.hw, b.hw),
    yBot: k(a.yBot, b.yBot),
    r: k(a.r, b.r),
    eaves: k(a.eaves, b.eaves),
    crown: k(a.crown, b.crown),
  };
}

/** Le même profil, rentré de `d` sur tout son pourtour. */
function inset(s: Section, d: number): Section {
  return {
    hw: s.hw - d,
    yBot: s.yBot + d,
    r: Math.max(0.05, s.r - d),
    eaves: s.eaves - d,
    crown: s.crown - d,
  };
}

/** Segments d'un coin bas / d'un demi-arc de pavillon. */
const CSEG = 6;
const TSEG = 9;
/** Points par anneau - identique d'une tranche à l'autre, le loft l'exige. */
const RING = 2 * (CSEG + 1) + 2 * TSEG + 1;

function quad(p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, t: number): THREE.Vector2 {
  const u = 1 - t;
  return new THREE.Vector2(
    u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  );
}

/**
 * Contour fermé d'une section, parcouru du bas-droit vers le sommet puis le
 * bas-gauche. Les portions droites (montants, bas de caisse) restent
 * implicites : ce sont les segments entre deux arcs consécutifs.
 */
function ring(s: Section): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  // Coin bas droit, de la sous-face au montant.
  for (let i = 0; i <= CSEG; i++) {
    const a = -Math.PI / 2 + (i / CSEG) * (Math.PI / 2);
    pts.push(new THREE.Vector2(s.hw - s.r + s.r * Math.cos(a), s.yBot + s.r + s.r * Math.sin(a)));
  }
  // Demi-voûte droite, de la gouttière au sommet.
  const rightEave = new THREE.Vector2(s.hw, s.eaves);
  const top = new THREE.Vector2(0, s.crown);
  for (let i = 0; i <= TSEG; i++) {
    pts.push(quad(rightEave, new THREE.Vector2(s.hw * 0.55, s.crown), top, i / TSEG));
  }
  // Demi-voûte gauche (le sommet n'est pas repris).
  const leftEave = new THREE.Vector2(-s.hw, s.eaves);
  for (let i = 1; i <= TSEG; i++) {
    pts.push(quad(top, new THREE.Vector2(-s.hw * 0.55, s.crown), leftEave, i / TSEG));
  }
  // Coin bas gauche, du montant à la sous-face.
  for (let i = 0; i <= CSEG; i++) {
    const a = Math.PI + (i / CSEG) * (Math.PI / 2);
    pts.push(new THREE.Vector2(-s.hw + s.r + s.r * Math.cos(a), s.yBot + s.r + s.r * Math.sin(a)));
  }
  return pts;
}

/**
 * Le contour d'une section en THREE.Shape, éventuellement rogné par deux
 * horizontales - c'est ainsi que la ceinture noire garde la voûte du pavillon
 * en haut et un bord droit en bas, et que le dégradé garde le galbe du bas de
 * masque et un bord droit en haut.
 *
 * Le rognage rabat les points hors bornes SUR la borne plutôt que de couper le
 * contour : la ligne droite se forme d'elle-même, et le contour reste fermé.
 */
function sectionShape(s: Section, yMin = -Infinity, yMax = Infinity): THREE.Shape {
  const pts: THREE.Vector2[] = [];
  for (const p of ring(s)) {
    const y = THREE.MathUtils.clamp(p.y, yMin, yMax);
    const last = pts[pts.length - 1];
    // Les points rabattus se superposent : les doublons feraient des triangles
    // dégénérés à la triangulation.
    if (last && Math.abs(last.x - p.x) < 1e-4 && Math.abs(last.y - y) < 1e-4) continue;
    pts.push(new THREE.Vector2(p.x, y));
  }
  return new THREE.Shape(pts);
}

/** Tranches du roulé, en plus de celle qui reste dans la caisse. */
const SLICES = 12;

/**
 * Peau du masque, plus son bouchon de face avant.
 *
 * Le roulé est paramétré par un angle θ ∈ [0, π/2] et non par z : l'avancée
 * suit sin θ, le resserrement 1 − cos θ. Les tranches se répartissent ainsi le
 * long de l'arc et non du seul axe - sinon tout le rayon se jouerait entre les
 * deux dernières et l'arête serait facettée.
 */
function buildMask(): THREE.BufferGeometry {
  // Partie droite : la section de caisse, de l'about jusqu'au départ du bord.
  const rings: THREE.Vector2[][] = [ring(BODY), ring(BODY)];
  const zs: number[] = [E235.bodyHalfLen - TUCK, STRAIGHT_TO];

  for (let j = 1; j <= SLICES; j++) {
    const th = (j / SLICES) * (Math.PI / 2);
    rings.push(ring(lerpSection(BODY, FACE, 1 - Math.cos(th))));
    zs.push(STRAIGHT_TO + ROLL * Math.sin(th));
  }

  const rows = rings.length;
  const pos = new Float32Array(rows * RING * 3);
  const uv = new Float32Array(rows * RING * 2);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < RING; i++) {
      const p = rings[j][i];
      const n = j * RING + i;
      pos[n * 3] = p.x;
      pos[n * 3 + 1] = p.y;
      pos[n * 3 + 2] = zs[j];
      uv[n * 2] = i / RING;
      uv[n * 2 + 1] = j / (rows - 1);
    }
  }

  const idx: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < RING; i++) {
      const a = j * RING + i;
      const b = j * RING + ((i + 1) % RING);
      idx.push(a, a + RING, b, b, a + RING, b + RING);
    }
  }

  const skin = new THREE.BufferGeometry();
  skin.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  skin.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  skin.setIndex(idx);
  skin.computeVertexNormals();

  // Bouchon : le contour de face, plan. Il est découpé dans le MÊME profil que
  // la dernière tranche du loft, donc leurs bords coïncident exactement.
  const cap = shapeGeo(sectionShape(FACE));
  cap.translate(0, 0, CAB_FRONT_Z);

  return merge([skin, cap], 'masque de cabine');
}

// --- Outillage -----------------------------------------------------------

function merge(parts: THREE.BufferGeometry[], what: string): THREE.BufferGeometry {
  const g = mergeGeometries(
    parts.map((p) => (p.index ? p.toNonIndexed() : p)),
    false,
  );
  if (!g) throw new Error(`Fusion impossible (${what}) : attributs hétérogènes`);
  return g;
}

/**
 * Remplissage d'un contour, UV renormalisées sur son encombrement.
 *
 * ShapeGeometry pose comme UV les coordonnées du plan telles quelles : une
 * texture posée dessus sans ce recalage part en morceaux.
 */
function shapeGeo(shape: THREE.Shape): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shape, 8);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const w = bb.max.x - bb.min.x;
  const h = bb.max.y - bb.min.y;
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, (p.getX(i) - bb.min.x) / w, (p.getY(i) - bb.min.y) / h);
  }
  return g;
}

/** Pose une géométrie construite à plat dans le plan XY sur la face avant. */
function onFace(geo: THREE.BufferGeometry, x: number, y: number, out: number): THREE.BufferGeometry {
  geo.translate(x, y, CAB_FRONT_Z + out);
  return geo;
}

/** Panneau rectangulaire à coins arrondis, centré sur l'origine. */
function panel(w: number, h: number, r: number): THREE.BufferGeometry {
  return shapeGeo(roundedRect(w, h, Math.min(r, Math.min(w, h) / 2)));
}

/** Boîte posée à plat dans le repère voiture. */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

// --- Cotes de la face avant ---------------------------------------------

/** Marge de vert entre le bord du masque et la ceinture noire. */
const VISOR_MARGIN = 0.1;
/** Marge de vert autour du dégradé pointillé. */
const CHECKER_MARGIN = 0.055;
/** Pare-brise : large et peu haut, comme sur la série. */
const GLASS = { hw: 1.1, y0: 1.08, y1: 1.84, pillar: 0.26, pillarW: 0.055 };
/** Bandeau supérieur : girouette au centre, blocs optiques aux extrémités. */
const LAMP = { w: 0.44, h: 0.34, x: 0.92 };
const BAND_Y = E235.windshieldTop - LAMP.h / 2;

export function buildCab(mats: CabMaterials, opts: CabOptions = {}): THREE.Group {
  const g = new THREE.Group();
  const parts = new Map<keyof CabMaterials, THREE.BufferGeometry[]>();
  const add = (mat: keyof CabMaterials, geo: THREE.BufferGeometry) => {
    const list = parts.get(mat);
    if (list) list.push(geo);
    else parts.set(mat, [geo]);
  };

  const head = opts.tail ? 'headlightOff' : 'headlight';
  const tail = opts.tail ? 'taillight' : 'taillightOff';

  add('green', buildMask());

  // --- Ceinture noire ---
  // Son bord haut et ses montants suivent le masque à dix centimètres ; seul
  // son plancher est droit. C'est ce contour-là qui fait la face du E235.
  add(
    'black',
    onFace(
      shapeGeo(sectionShape(inset(FACE, VISOR_MARGIN), E235.windshieldBottom)),
      0,
      0,
      0.004,
    ),
  );

  // Deux glaces séparées par le montant de cabine, décalé côté conducteur.
  const gy = (GLASS.y0 + GLASS.y1) / 2;
  for (const [x0, x1] of [
    [-GLASS.hw, GLASS.pillar - GLASS.pillarW / 2],
    [GLASS.pillar + GLASS.pillarW / 2, GLASS.hw],
  ] as const) {
    add('windshield', onFace(panel(x1 - x0, GLASS.y1 - GLASS.y0, 0.1), (x0 + x1) / 2, gy, 0.014));
  }
  // Joint bas de glace : il casse le noir sur noir sous le pare-brise.
  add('metal', onFace(panel(GLASS.hw * 2 + 0.03, 0.028, 0.012), 0, GLASS.y0 - 0.03, 0.016));

  // --- Girouette et blocs optiques ---
  add('sign', onFace(new THREE.PlaneGeometry(1.24, 0.24), 0.02, BAND_Y, 0.016));

  for (const s of [1, -1] as const) {
    // Capot du bloc, en légère saillie de la ceinture.
    add('metal', onFace(panel(LAMP.w, LAMP.h, 0.06), s * LAMP.x, BAND_Y, 0.01));
    add('black', onFace(panel(LAMP.w - 0.04, LAMP.h - 0.04, 0.05), s * LAMP.x, BAND_Y, 0.014));
    // Phare : deux pastilles LED côte à côte, comme sur la série.
    for (const d of [-1, 1] as const) {
      add(head, onFace(panel(0.15, 0.1, 0.03), s * LAMP.x + d * 0.088, BAND_Y + 0.08, 0.022));
    }
    // Feu rouge, sous le phare dans le même capot.
    add(tail, onFace(panel(0.32, 0.085, 0.03), s * LAMP.x, BAND_Y - 0.09, 0.022));
  }

  // --- Essuie-glaces, au repos en bas de glace ---
  for (const s of [1, -1] as const) {
    const px = s * 0.52;
    const tilt = s * 0.36;
    const arm = new THREE.BoxGeometry(0.032, 0.6, 0.028);
    arm.translate(0, 0.3, 0);
    arm.rotateZ(tilt);
    add('metal', onFace(arm, px, GLASS.y0 + 0.03, 0.02));
    const blade = new THREE.BoxGeometry(0.045, 0.48, 0.04);
    blade.translate(0, 0.33, 0);
    blade.rotateZ(tilt);
    add('black', onFace(blade, px, GLASS.y0 + 0.03, 0.028));
    const boss = new THREE.CylinderGeometry(0.042, 0.042, 0.05, 10);
    boss.rotateX(Math.PI / 2);
    add('metal', onFace(boss, px, GLASS.y0 + 0.03, 0.024));
  }

  // --- Dégradé pointillé sous le pare-brise ---
  // Même découpe que la ceinture, à l'envers : bord droit en haut, et le galbe
  // du bas de masque en bas. Un rectangle y montrerait ses angles hors du vert.
  add(
    'checker',
    onFace(
      shapeGeo(sectionShape(inset(FACE, CHECKER_MARGIN), -Infinity, E235.windshieldBottom - 0.07)),
      0,
      0,
      0.006,
    ),
  );

  // --- Traverse de choc, jupes et attelage ---
  // Traverse pleine largeur sous le masque : c'est elle qui referme la face en
  // bas. Elle est plus large que le bas du masque, qui doit tomber dedans, et
  // court jusqu'à l'about où le châssis de caisse la relaie.
  //
  // Sa face AVANCE de deux centimètres sur celle du masque. Affleurantes, les
  // deux surfaces sont coplanaires sur les quatre centimètres où elles se
  // recouvrent, et ce liseré se met à clignoter d'un pas de caméra à l'autre.
  add('underframe', box(2.94, 0.3, 0.74, 0, -0.03, CAB_FRONT_Z - 0.35));
  // Nervure d'anti-chevauchement, qui casse l'aplat noir de trois quarts.
  add('underframe', box(2.7, 0.03, 0.04, 0, -0.1, CAB_FRONT_Z + 0.03));
  // Deux jupes latérales, et non un tablier plein : c'est l'échancrure entre
  // les deux qui laisse voir l'attelage, comme sur la série.
  for (const s of [1, -1] as const) {
    add('underframe', box(0.72, 0.42, 0.42, s * 0.66, -0.4, CAB_FRONT_Z - 0.32));
  }

  // Attelage : fût, tête et mâchoire, dans l'échancrure.
  add('underframe', box(0.34, 0.24, 0.56, 0, -0.42, CAB_FRONT_Z - 0.44));
  add('underframe', box(0.62, 0.38, 0.24, 0, -0.42, CAB_FRONT_Z - 0.08));
  add('metal', box(0.2, 0.26, 0.14, 0.13, -0.42, CAB_FRONT_Z + 0.02));

  // Boyaux de frein, de part et d'autre de l'attelage.
  for (const s of [1, -1] as const) {
    const hose = new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8);
    hose.rotateZ(s * 0.25);
    hose.translate(s * 0.28, -0.42, CAB_FRONT_Z - 0.2);
    add('black', hose);
  }

  // --- Toit de cabine ---
  // Antenne fouet sur son socle, juste en arrière du roulé.
  add('metal', box(0.24, 0.08, 0.5, 0.42, E235.roofCrownY + 0.02, E235.bodyHalfLen - 0.9));
  add('metal', box(0.035, 0.44, 0.035, 0.42, E235.roofCrownY + 0.26, E235.bodyHalfLen - 0.9));
  // Capot d'avertisseur, sur l'arête du pavillon.
  add('metal', box(0.5, 0.1, 0.34, 0, E235.roofCrownY + 0.01, E235.bodyHalfLen - 0.2));

  for (const [key, list] of parts) {
    g.add(new THREE.Mesh(merge(list, `cabine ${key}`), mats[key]));
  }
  return g;
}
