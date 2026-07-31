// Nez de cabine du E235-0 : le masque vert, sa ceinture noire, le pare-brise
// incliné, le dégradé pointillé qui court dessous, la girouette LED, les blocs
// optiques et l'attelage. Construit pour l'extrémité +z d'une voiture ; la
// voiture de queue reçoit le même objet, retourné d'un demi-tour.
//
// Le masque n'est PAS une plaque extrudée : c'est un loft. On part de la
// section exacte de la caisse (flancs droits + voûte de pavillon) à l'about,
// et on la referme en quart d'ellipse sur les soixante derniers centimètres -
// c'est ce qui donne au nez son galbe, et c'est ce qui permet au pavillon de
// se poursuivre jusqu'à la face avant sans la marche que laissait la plaque.
//
// La face avant est COUCHÉE : au-dessus du bas de pare-brise elle recule de
// `RAKE` mètre par mètre de hauteur. Tout ce qui s'y pose (vitrage, girouette,
// feux, essuie-glaces) passe par `onFace`, qui reprend cette inclinaison -
// poser un élément à plat le ferait saillir du masque par le haut.
//
// Toutes les pièces sont fusionnées par matériau : une cabine complète tient
// en une dizaine d'appels de rendu, pour quatre cabines dans la scène (deux
// pour notre rame, deux pour celle d'en face).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { E235 } from '../../data/e235';
import { roundedRect } from '../shapes';

/** Abscisse longitudinale du point le plus avancé du nez, en repère voiture. */
export const CAB_FRONT_Z = E235.bodyHalfLen + 0.6;

/** Saillie du masque au-delà de l'about de caisse : la longueur du galbe. */
const PROTRUDE = CAB_FRONT_Z - E235.bodyHalfLen;
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

/** Recul du haut de face, en mètre par mètre de hauteur (tan de l'inclinaison). */
const RAKE = 0.18;
/** Hauteur de la charnière : sous elle, la face reste verticale. */
const RAKE_PIVOT = E235.windshieldBottom;
const RAKE_ANGLE = Math.atan(RAKE);
const RAKE_COS = Math.cos(RAKE_ANGLE);
const RAKE_SIN = Math.sin(RAKE_ANGLE);

/** Abscisse de la face avant à la hauteur `y`. */
function faceZ(y: number): number {
  return CAB_FRONT_Z - RAKE * Math.max(0, y - RAKE_PIVOT);
}

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
 * entre l'about de caisse et la face avant.
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
 * À la face : plus étroite et plus basse que la caisse, coins très ouverts -
 * c'est ce galbe qui fait reconnaître la série de loin.
 *
 * Le sommet ne descend que d'une dizaine de centimètres sous le pavillon. Il
 * était bien plus bas au premier jet : le nez s'en trouvait décapité, et
 * depuis le quai on voyait le toit gris par-dessus la face avant, ce qu'aucune
 * photo de la série ne montre.
 */
const FACE: Section = {
  hw: 1.3,
  yBot: 0.04,
  r: 0.4,
  eaves: 2.42,
  crown: 2.5,
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

/** Tranches du galbe, en plus de celle qui reste dans la caisse. */
const SLICES = 12;

/**
 * Peau du masque, plus son bouchon de face avant.
 *
 * Le galbe est paramétré par un angle θ ∈ [0, π/2] et non par z : l'avancée
 * suit sin θ, le resserrement 1 − cos θ. Les tranches se répartissent ainsi le
 * long de l'arc et non du seul axe - sinon tout le rayon se jouerait entre les
 * deux dernières et le nez serait facetté.
 */
function buildMask(): THREE.BufferGeometry {
  const rings: THREE.Vector2[][] = [];
  const zs: number[] = [];
  const shears: number[] = [];

  rings.push(ring(BODY));
  zs.push(E235.bodyHalfLen - TUCK);
  shears.push(0);

  for (let j = 0; j <= SLICES; j++) {
    const th = (j / SLICES) * (Math.PI / 2);
    const k = 1 - Math.cos(th);
    rings.push(ring(lerpSection(BODY, FACE, k)));
    zs.push(E235.bodyHalfLen + PROTRUDE * Math.sin(th));
    shears.push(k);
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
      // Le couchage croît avec le galbe : nul à l'about, entier à la face, où
      // il doit retomber exactement sur faceZ().
      pos[n * 3 + 2] = zs[j] - RAKE * shears[j] * Math.max(0, p.y - RAKE_PIVOT);
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

  // Bouchon : le contour de face en éventail. L'apex est mis à la charnière
  // pour que le pli du couchage passe par lui, et non en travers des triangles.
  const face = rings[rows - 1];
  const capPos: number[] = [];
  const capUv: number[] = [];
  const push = (x: number, y: number) => {
    capPos.push(x, y, faceZ(y));
    capUv.push(0.5 + x / (FACE.hw * 2), (y - FACE.yBot) / (FACE.crown - FACE.yBot));
  };
  for (let i = 0; i < RING; i++) {
    const p = face[i];
    const q = face[(i + 1) % RING];
    push(0, RAKE_PIVOT);
    push(p.x, p.y);
    push(q.x, q.y);
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
  cap.setAttribute('uv', new THREE.Float32BufferAttribute(capUv, 2));
  cap.computeVertexNormals();

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
 * Pose une géométrie construite à plat dans le plan XY sur la face couchée.
 * `out` est le déport le long de la normale - la saillie hors du masque.
 */
function onFace(geo: THREE.BufferGeometry, x: number, y: number, out: number): THREE.BufferGeometry {
  geo.rotateX(-RAKE_ANGLE);
  geo.translate(x, y + out * RAKE_SIN, faceZ(y) + out * RAKE_COS);
  return geo;
}

/**
 * Panneau plat à coins arrondis, centré sur l'origine, prêt pour `onFace`.
 * Les UV de ShapeGeometry valent les coordonnées du plan : elles sont
 * renormalisées ici, sinon toute texture posée dessus part en morceaux.
 */
function panel(w: number, h: number, r: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, Math.min(r, Math.min(w, h) / 2)), 8);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  }
  return g;
}

/** Boîte posée à plat dans le repère voiture. */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

// --- Cotes de la face avant ---------------------------------------------

/** Ceinture noire : elle englobe le pare-brise ET le bandeau des feux. */
const VISOR = { hw: 1.22, y0: 1.0, y1: 2.32, r: 0.18 };
/** Pare-brise : large et peu haut, comme sur la série. */
const GLASS = { hw: 1.14, y0: 1.06, y1: 1.88, pillar: 0.26, pillarW: 0.055 };
/** Bandeau supérieur : girouette au centre, blocs optiques aux extrémités. */
const BAND_Y = 2.1;
const LAMP_X = 1.0;

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

  // --- Ceinture noire et pare-brise ---
  add(
    'black',
    onFace(panel(VISOR.hw * 2, VISOR.y1 - VISOR.y0, VISOR.r), 0, (VISOR.y0 + VISOR.y1) / 2, 0.004),
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
  add('sign', onFace(new THREE.PlaneGeometry(1.36, 0.24), 0.04, BAND_Y, 0.016));

  for (const s of [1, -1] as const) {
    // Capot du bloc, en légère saillie de la ceinture.
    add('metal', onFace(panel(0.44, 0.34, 0.06), s * LAMP_X, BAND_Y, 0.01));
    add('black', onFace(panel(0.4, 0.3, 0.05), s * LAMP_X, BAND_Y, 0.014));
    // Phare : deux pastilles LED côte à côte, comme sur la série.
    for (const d of [-1, 1] as const) {
      add(head, onFace(panel(0.15, 0.1, 0.03), s * LAMP_X + d * 0.088, BAND_Y + 0.08, 0.022));
    }
    // Feu rouge, sous le phare dans le même capot.
    add(tail, onFace(panel(0.32, 0.085, 0.03), s * LAMP_X, BAND_Y - 0.09, 0.022));
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
  // Sous la charnière la face est verticale : rien à coucher ici. Le panneau
  // est arrondi comme le bas du masque, sinon ses angles en dépassent.
  const checker = panel(2.36, 0.82, 0.3);
  checker.translate(0, 0.55, CAB_FRONT_Z + 0.006);
  add('checker', checker);

  // --- Traverse de choc, jupes et attelage ---
  // Traverse pleine largeur sous le masque : c'est elle qui referme la face en
  // bas. Elle court jusqu'à l'about, où le châssis de caisse la relaie ; entre
  // les deux, on verrait le dessous du masque.
  // Elle est plus large que la face : le bord bas du masque doit tomber dedans,
  // sans quoi il dépasse en langue verte sous le nez.
  add('underframe', box(2.72, 0.26, 0.72, 0, -0.05, CAB_FRONT_Z - 0.36));
  // Nervure d'anti-chevauchement, qui casse l'aplat noir de trois quarts.
  add('underframe', box(2.5, 0.03, 0.04, 0, -0.15, CAB_FRONT_Z + 0.008));
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
  // Antenne fouet sur son socle, juste en arrière du galbe.
  add('metal', box(0.24, 0.08, 0.5, 0.42, E235.roofCrownY + 0.02, E235.bodyHalfLen - 0.9));
  add('metal', box(0.035, 0.44, 0.035, 0.42, E235.roofCrownY + 0.26, E235.bodyHalfLen - 0.9));
  // Capot d'avertisseur, sur l'arête du pavillon.
  add('metal', box(0.5, 0.1, 0.34, 0, E235.roofCrownY + 0.01, E235.bodyHalfLen - 0.2));

  for (const [key, list] of parts) {
    g.add(new THREE.Mesh(merge(list, `cabine ${key}`), mats[key]));
  }
  return g;
}
