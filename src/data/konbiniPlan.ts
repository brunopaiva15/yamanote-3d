// L'agencement intérieur du konbini : une implantation, deux lecteurs.
//
// POURQUOI CE FICHIER EXISTE. Tant que la boutique était un bloc plein qu'on
// longeait, ses cotes intérieures n'intéressaient que le rendu : personne
// n'entrait, donc personne n'avait besoin de savoir où était la gondole. Elle
// s'ouvre maintenant - on y entre, on y marche, on en fait le tour - et le
// dépôt a déjà tranché ce que cela implique : « une implantation, deux
// lecteurs ». Le rendu (`three/station/Konbini`) et la marche
// (`data/stationInterior` → `systems/walkable`) lisent la MÊME liste, ou l'on
// se retrouve à traverser une vitrine et à buter sur du vide.
//
// LE REPÈRE. Local à la boutique, celui dans lequel le rendu la construit :
//
//   x : le long de la paroi qui la porte, de -w/2 à +w/2 ;
//   z : la profondeur, du fond (-d/2) à la DEVANTURE (+d/2) ;
//   y : depuis le sol de la boutique.
//
// `data/stationInterior` se charge de rabattre ce repère dans celui du quai -
// la boutique est posée contre l'une ou l'autre paroi du hall, donc tournée
// d'un quart de tour dans un sens ou dans l'autre.
//
// CE QUI EST ÉCRIT ICI, ET CE QUI NE L'EST PAS. On y trouve les emprises AU
// SOL et les cotes dont la marche a besoin - c'est-à-dire tout ce qui barre le
// passage, plus la baie par où l'on entre. Les hauteurs, les matériaux, les
// bandeaux et la garniture restent au rendu : la marche ne monte pas sur la
// gondole, elle la contourne.

/** Épaisseur des parois de la coque, et du châssis de la devanture. */
export const KONBINI_WALL = 0.12;

/** Un rectangle du repère local de la boutique. */
export interface LocalRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Un point du repère local de la boutique. */
export interface LocalPoint {
  x: number;
  z: number;
}

/**
 * Où se tient un CLIENT dans la boutique.
 *
 * Un konbini n'est pas un couloir qu'on traverse : on y entre, on regarde un
 * rayon, on prend quelque chose, on paie, on ressort. Ces six points sont les
 * seuls endroits où l'on s'arrête, et l'ordre dans lequel on les enchaîne EST
 * la visite (systems/concourseRoute).
 *
 * Ils ne sont pas placés à l'oeil : chacun se déduit des meubles qui
 * l'entourent, et se retrouve donc au MILIEU du passage laissé entre eux. Un
 * point écrit en dur aurait fini dans une gondole le jour où une cote de
 * meuble bouge - et le fichier qui la fait bouger est celui-ci.
 */
export interface KonbiniStops {
  /** Devant la baie, DEHORS : d'où l'on entre, et où l'on ressort. */
  door: LocalPoint;
  /** Juste dedans, entre le bac à glaces et les paniers. */
  entry: LocalPoint;
  /** L'allée du fond, devant les vitrines réfrigérées. */
  cold: LocalPoint;
  /** Le passage laissé entre le présentoir à magazines et le bac à glaces. */
  gap: LocalPoint;
  /** Devant la gondole centrale. */
  aisle: LocalPoint;
  /** Devant la caisse, côté client. */
  till: LocalPoint;
}

export interface KonbiniPlan {
  w: number;
  d: number;
  /** Demi-largeur intérieure, au nu des joues. */
  hw: number;
  /** Nu intérieur du fond, et nu de la devanture. */
  zb: number;
  zf: number;
  /** Fin du bloc de gauche : caisse devant, meuble froid derrière. */
  leftEnd: number;
  /** La baie d'entrée : largeur, axe, et ses deux bords. */
  doorW: number;
  doorX: number;
  doorL: number;
  doorR: number;
  /** Profondeur des meubles du fond, et de la gondole. */
  coolD: number;
  gondD: number;
  gondZ: number;
  gondX0: number;
  gondX1: number;
  /** Présentoir à magazines, plaqué contre la vitre. */
  rackD: number;
  rackZ: number;
  rackX0: number;
  rackX1: number;
  /** Vitrines réfrigérées du fond : emprise et découpage en portes. */
  coolX0: number;
  coolX1: number;
  doors: number;
  doorPitch: number;
  /** Comptoir de caisse. */
  counter: { x0: number; x1: number; z0: number; depth: number };
  /** Bac à glaces, en plein passage. */
  chest: { x: number; z: number; w: number; d: number };
  /** Pile de paniers, près de l'entrée. */
  baskets: { x: number; z: number };
  /** Où se tient le vendeur, derrière sa caisse. */
  clerk: { x: number; z: number };
  /** Les six points où un client s'arrête - et par lesquels il circule. */
  stops: KonbiniStops;
  /**
   * Tout ce qui BARRE, en emprises au sol.
   *
   * La devanture y figure en DEUX morceaux, un de chaque côté de la baie : le
   * vide entre les deux est l'entrée, et c'est le seul endroit par où l'on
   * passe. Les vantaux, eux, n'y sont pas - une porte automatique s'ouvre parce
   * qu'on s'en approche, et une porte qu'il faudrait pousser n'existe pas dans
   * un konbini.
   */
  solids: LocalRect[];
}

/**
 * L'agencement d'une boutique, déduit de son emprise.
 *
 * Rien n'est écrit en dur qui dépende d'une largeur particulière : une
 * boutique de 6,40 m et une de 8 m se meublent de la même façon, avec moins de
 * portes de vitrine. C'est ce qui permet à l'emprise de venir du moteur de
 * rangement du hall plutôt que d'une table de cotes.
 */
export function konbiniPlan(w: number, d: number): KonbiniPlan {
  const hw = w / 2 - KONBINI_WALL;
  const zb = -d / 2 + KONBINI_WALL;
  const zf = d / 2;

  const leftEnd = -hw + Math.min(2.2, w * 0.28);
  const doorW = Math.min(1.7, w * 0.22);
  const doorX = hw - doorW / 2 - Math.min(0.6, w * 0.08);
  const doorL = doorX - doorW / 2;
  const doorR = doorX + doorW / 2;

  const coolD = Math.min(0.68, d * 0.2);
  const gondD = Math.min(0.56, d * 0.17);
  /** Allée laissée devant les vitrines du fond. */
  const gondZ = zb + coolD + 0.68 + gondD / 2;
  const gondX0 = leftEnd + 0.12;
  const gondX1 = doorL - 0.34;

  const rackD = 0.3;
  const rackZ = zf - 0.08 - rackD / 2;
  const rackX0 = gondX0 + 0.2;
  const rackX1 = Math.min(gondX1 - 0.2, rackX0 + (gondX1 - gondX0) * 0.46);

  const coolX0 = leftEnd + 0.1;
  const coolX1 = hw - 0.04;
  const doors = Math.max(2, Math.round((coolX1 - coolX0) / 1.05));
  const doorPitch = (coolX1 - coolX0) / doors;

  // Le comptoir n'est pas adossé au meuble froid : il faut TENIR DEBOUT
  // derrière, et se retourner pour attraper un sachet. Quatre-vingt-dix
  // centimètres d'arrière-caisse - à cinquante, le vendeur était pris en
  // sandwich entre deux meubles.
  const counter = {
    x0: -hw + 0.04,
    x1: leftEnd - 0.06,
    z0: zb + coolD + 0.92,
    depth: Math.min(0.72, d * 0.21),
  };
  const chest = { x: doorX - doorW * 0.42, z: zf - 0.84, w: 1.32, d: 0.78 };
  const baskets = { x: Math.min(hw - 0.24, doorR + 0.3), z: zf - 0.5 };
  const clerk = { x: (-hw + leftEnd) / 2 - 0.25, z: zb + coolD + 0.5 };

  // --- Par où passe un client, et où il s'arrête -----------------------
  //
  // Les trois couloirs de la boutique, chacun pris en son milieu :
  //   · à DROITE du bac à glaces, de la baie jusqu'au fond ;
  //   · le long de la VITRINE, entre le bac à glaces et le verre ;
  //   · le GOULET entre le présentoir à magazines et le bac à glaces, seul
  //     passage vers la moitié gauche de la boutique.
  // Un konbini de gare est étroit - trente centimètres au plus serré - et
  // c'est ce qui fait qu'on s'y frôle. Personne ne s'y croise de front, et
  // c'est très bien ainsi.
  const rightLane = (chest.x + chest.w / 2 + Math.min(hw, baskets.x - 0.24)) / 2;
  const frontLane = (chest.z + chest.d / 2 + zf - KONBINI_WALL) / 2;
  const gapX = (rackX1 + chest.x - chest.w / 2) / 2;
  const stops: KonbiniStops = {
    door: { x: doorX, z: zf + 0.55 },
    entry: { x: rightLane, z: frontLane },
    cold: { x: rightLane, z: (zb + coolD + gondZ - gondD / 2) / 2 },
    gap: { x: gapX, z: frontLane },
    aisle: { x: gapX, z: (gondZ + gondD / 2 + rackZ - rackD / 2) / 2 },
    till: { x: (counter.x0 + counter.x1) / 2, z: counter.z0 + counter.depth + 0.42 },
  };

  const solids: LocalRect[] = [
    // La coque : fond et joues.
    { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: zb },
    { x0: -w / 2, x1: -hw, z0: -d / 2, z1: d / 2 },
    { x0: hw, x1: w / 2, z0: -d / 2, z1: d / 2 },
    // La devanture, EN DEUX MORCEAUX : le vide entre eux est l'entrée.
    { x0: -w / 2, x1: doorL, z0: zf - KONBINI_WALL, z1: zf },
    { x0: doorR, x1: w / 2, z0: zf - KONBINI_WALL, z1: zf },
    // Le mobilier de vente.
    { x0: coolX0, x1: coolX1, z0: zb, z1: zb + coolD },
    { x0: -hw, x1: leftEnd, z0: zb, z1: zb + coolD },
    { x0: gondX0, x1: gondX1, z0: gondZ - gondD / 2 - 0.03, z1: gondZ + gondD / 2 + 0.03 },
    { x0: rackX0, x1: rackX1, z0: rackZ - rackD / 2, z1: rackZ + rackD / 2 },
    { x0: counter.x0, x1: counter.x1, z0: counter.z0, z1: counter.z0 + counter.depth },
    { x0: chest.x - chest.w / 2, x1: chest.x + chest.w / 2, z0: chest.z - chest.d / 2, z1: chest.z + chest.d / 2 },
    { x0: baskets.x - 0.2, x1: baskets.x + 0.2, z0: baskets.z - 0.16, z1: baskets.z + 0.16 },
    // Le vendeur : on ne le traverse pas plus qu'un voyageur du quai.
    { x0: clerk.x - 0.26, x1: clerk.x + 0.26, z0: clerk.z - 0.26, z1: clerk.z + 0.26 },
  ];

  return {
    w,
    d,
    hw,
    zb,
    zf,
    leftEnd,
    doorW,
    doorX,
    doorL,
    doorR,
    coolD,
    gondD,
    gondZ,
    gondX0,
    gondX1,
    rackD,
    rackZ,
    rackX0,
    rackX1,
    coolX0,
    coolX1,
    doors,
    doorPitch,
    counter,
    chest,
    baskets,
    clerk,
    stops,
    solids,
  };
}
