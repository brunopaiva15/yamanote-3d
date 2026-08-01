// La quincaillerie commune aux deux commerces de gare : le konbini du hall et
// le kiosque du quai.
//
// POURQUOI UN POOL, ET NON UN JEU PAR GARE. Un commerce garni demande une
// vingtaine d'images - rayonnages, portes de vitrine, magazines, journaux,
// cartes de prix, affiches - et rien là-dedans n'appartient à une gare en
// particulier : le même paquet de biscuits est sur la même étagère à Ueno et à
// Shinagawa. Les dessiner à chaque arrivée en gare, deux fois (une pour le
// kiosque, une pour le konbini), aurait coûté une quarantaine de canvas par
// arrêt - c'est-à-dire une saccade à chaque entrée en gare, pour rien.
//
// Elles sont donc construites UNE FOIS pour la session et jamais libérées,
// exactement comme le pool d'affiches (`adPool`), et pour la même raison. Ce
// qui change d'une gare à l'autre - le bandeau d'enseigne, qui porte le nom de
// la gare - reste à la charge de chaque commerce, qui le construit et le libère
// avec lui.
//
// LES PRODUITS SONT EN VOLUME, PAS EN IMAGE. Un rayon peint suffit derrière une
// vitre, à trois mètres et de trois quarts ; il ne suffit plus quand on a le
// nez dessus, sous l'auvent d'un kiosque. Les étagères portent donc de vrais
// articles - huit cents à mille par boutique, teintés par exemplaire, en DEUX
// InstancedMesh (le prisme et le révolutionné, voir `Good`) et donc deux appels
// de rendu quel qu'en soit le nombre. C'est la règle du chantier (« ce qui se
// répète s'instancie ») appliquée à ce qui se répète le plus dans une gare.

import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { dayNightWeights } from '../../systems/daynight';
import { runtime } from '../../systems/runtime';
import {
  goodsTone,
  makeChilledCaseTexture,
  makeChillerBandTexture,
  makeCoolerDoorTexture,
  makeGondolaHeaderTexture,
  makeMagazineRowTexture,
  makeNewspaperRowTexture,
  makePopCardTexture,
  makePromoPosterTexture,
  makeRegisterScreenTexture,
  makeShelfRailTexture,
  makeShopFloorTexture,
  makeShopGlowTexture,
  makeShutterTexture,
  makeTobaccoWallTexture,
  makeAutoDoorDecalTexture,
  type ChillerBand,
} from '../../textures/konbini';
import { rng } from '../../textures/procedural';
import { mat } from './instancing';

export interface ShopPool {
  /** Portes de vitrine réfrigérée. */
  coolers: THREE.MeshBasicMaterial[];
  /** Meuble froid ouvert : onigiri, sandwichs. */
  chilled: THREE.MeshBasicMaterial[];
  /** Étages de présentoir à magazines : une rangée entière par image. */
  magazines: THREE.MeshBasicMaterial[];
  /** Étalages de quotidiens à plat, vus de dessus. */
  papers: THREE.MeshBasicMaterial[];
  /** Cartes de prix suspendues. */
  pops: THREE.MeshBasicMaterial[];
  /** Affiches saisonnières collées sur la vitrine. */
  posters: THREE.MeshBasicMaterial[];
  /** Armoire à cigarettes, derrière la caisse. */
  tobacco: THREE.MeshBasicMaterial;
  /** Écran de caisse, côté client. */
  screen: THREE.MeshBasicMaterial;
  /** Bandeau 自動ドア collé sur les vantaux. */
  autoDoor: THREE.MeshBasicMaterial;
  /** Carrelage terracotta de la boutique. */
  floor: THREE.MeshStandardMaterial;
  /** Rideau métallique des bouts fermés. */
  shutter: THREE.MeshStandardMaterial;
  /** Tôle laquée du mobilier de vente : gondoles, meubles froids, comptoir. */
  casework: THREE.MeshStandardMaterial;
  /** Nez d'étagère et rails d'étiquettes : plus clairs que la tôle. */
  lip: THREE.MeshStandardMaterial;
  /**
   * Le socle des gondoles : rouge sombre, et jamais de la couleur du meuble.
   *
   * Une gondole de konbini pose sur une plinthe LAQUÉE ROUGE - c'est ce qui
   * l'ancre au sol et lui donne son assise. Peinte de la même tôle crème que
   * les étagères, elle avait l'air de flotter, et le meuble entier perdait son
   * poids.
   */
  plinth: THREE.MeshStandardMaterial;
  /** Pare-chocs et joues des meubles froids : l'orange chaud des enseignes. */
  bumper: THREE.MeshStandardMaterial;
  /** Montants, corbeilles et arceaux : l'acier chromé du mobilier de vente. */
  chrome: THREE.MeshStandardMaterial;
  /** Rail d'étiquettes du nez d'étagère, avec ses prix. */
  rail: THREE.MeshBasicMaterial;
  /** Fronton de gondole, aux couleurs de l'enseigne. */
  gondolaHeader: THREE.MeshBasicMaterial;
  /** Bandeaux de meubles froids, par famille. */
  bands: Record<ChillerBand, THREE.MeshBasicMaterial>;
  /** Réglette de plafond et bandeau lumineux des meubles. */
  lit: THREE.MeshBasicMaterial;
  /** Dalle de plafond de la boutique : blanche, et jamais celle du hall. */
  ceiling: THREE.MeshStandardMaterial;
  /**
   * La flaque de lumière au sol, en mélange additif. Deux états, et c'est un
   * fait d'éclairage, pas une commodité :
   *
   *   · `glow` est celle du QUAI, à ciel ouvert ou sous auvent. Elle n'existe
   *     qu'à la tombée du jour et s'éteint tout à fait de jour - une flaque de
   *     lumière à quinze heures se remarque ;
   *   · `glowSteady` est celle du HALL, deux niveaux sous terre, où il fait
   *     nuit à toute heure. Elle ne varie jamais, parce que rien de ce qui
   *     l'entoure ne varie.
   *
   * `glow` est le seul matériau du pool dont l'état change en cours de route,
   * et un seul objet le pilote : il n'y a qu'un kiosque par gare.
   */
  glow: THREE.MeshBasicMaterial;
  glowSteady: THREE.MeshBasicMaterial;
  /**
   * Marchandise instanciée : blanc, teinté par exemplaire.
   *
   * Un rayon de konbini est éclairé à plat par des tubes au plafond, sans
   * ombre portée et sans reflet - une tôle mate le rendrait terne, un plastique
   * brillant le ferait scintiller. Rugosité moyenne, aucun métal.
   */
  goods: THREE.MeshStandardMaterial;
}

let pool: ShopPool | null = null;

function glowMaterial(map: THREE.Texture, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    // Elle est POSÉE sur le sol, à trois millimètres : sans décalage, elle
    // clignote au ras de la dalle dès qu'on s'en éloigne.
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
}

export function shopPool(): ShopPool {
  if (pool) return pool;
  /**
   * Une surface IMPRIMÉE, collée sur ce qui la porte.
   *
   * Toutes sans exception - bandeaux, rails d'étiquettes, frontons, portes de
   * vitrine, affiches, écrans - sont des DÉCALCOMANIES : elles n'ont pas
   * d'épaisseur, et elles se posent au nu du meuble sur lequel elles sont
   * collées. C'est exactement la situation qui produit du z-fighting, et la
   * poser un millimètre devant ne la règle pas : à trois mètres d'une caméra
   * dont le plan proche est à dix centimètres, un millimètre tombe SOUS la
   * précision du tampon de profondeur, et le bandeau se met à grésiller par
   * bandes dès qu'on tourne la tête.
   *
   * Le décalage de polygone est fait pour ça, et le dépôt s'en sert déjà pour
   * tout ce qui est peint SUR une autre surface - bande podotactile, liseré de
   * quai, repères d'attente (`three/station/materials`). Une décalcomanie de
   * commerce n'est rien d'autre.
   */
  const flat = (t: THREE.Texture) =>
    new THREE.MeshBasicMaterial({
      map: t,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  const floorMap = makeShopFloorTexture();
  // L'image porte DEUX carreaux de côté, et un carreau de grès fait 45 cm : la
  // répétition se calcule sur la boutique la plus courante (7,80 × 3,40) pour
  // que les joints tombent carrés. Un carrelage étiré se voit tout de suite -
  // c'est même la seule chose qu'on remarque d'un sol.
  floorMap.repeat.set(7.8 / 0.9, 3.4 / 0.9);
  const shutterMap = makeShutterTexture();
  shutterMap.repeat.set(3, 1);
  const glowMap = makeShopGlowTexture();
  const railMap = makeShelfRailTexture();
  railMap.repeat.set(3, 1);
  const headerMap = makeGondolaHeaderTexture();
  headerMap.repeat.set(2, 1);

  pool = {
    coolers: [0, 1, 2].map((i) => flat(makeCoolerDoorTexture(i))),
    chilled: [0, 1].map((i) => flat(makeChilledCaseTexture(i))),
    // Cinq à sept couvertures par rangée, et pas douze : un râtelier fait un
    // mètre vingt, une couverture vingt centimètres. Serrées à douze, elles
    // tombaient sous la taille du texel à trois mètres et la rangée entière
    // virait au pastel - un aplat mou là où il fallait des couleurs franches.
    magazines: [0, 1, 2].map((i) => flat(makeMagazineRowTexture(i, 5 + i))),
    papers: [0, 1].map((i) => flat(makeNewspaperRowTexture(i))),
    pops: [0, 1, 2, 3, 4].map((i) => flat(makePopCardTexture(i))),
    posters: [0, 1, 2, 3].map((i) => flat(makePromoPosterTexture(i))),
    tobacco: flat(makeTobaccoWallTexture()),
    screen: flat(makeRegisterScreenTexture()),
    autoDoor: new THREE.MeshBasicMaterial({
      map: makeAutoDoorDecalTexture(),
      toneMapped: false,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
    floor: new THREE.MeshStandardMaterial({
      map: floorMap,
      roughness: 0.55,
      metalness: 0.02,
      // Le grès renvoie la lumière des tubes : c'est le SOL qui éclaire le bas
      // des rayons dans un konbini, et son reflet chaud est pour moitié dans
      // l'ambiance du lieu.
      emissive: '#8a6a52',
      emissiveIntensity: 0.3,
    }),
    shutter: new THREE.MeshStandardMaterial({
      map: shutterMap,
      roughness: 0.44,
      metalness: 0.55,
    }),
    // Le mobilier de vente est de la tôle laquée CRÈME sous des tubes nus, et
    // non blanche : un konbini est un lieu CHAUD - carrelage terracotta, bois,
    // bandeaux orange - et du blanc pur au milieu de tout cela y faisait un
    // trou froid. Le rappel d'émissif est là pour une autre raison : sans lui,
    // le mobilier prenait le gris du hall à travers la vitrine et la boutique
    // paraissait éteinte du dehors.
    casework: new THREE.MeshStandardMaterial({
      color: '#f2e9d6',
      roughness: 0.5,
      metalness: 0.06,
      emissive: '#e6dcc4',
      emissiveIntensity: 0.3,
    }),
    lip: new THREE.MeshStandardMaterial({
      color: '#fbf6ea',
      roughness: 0.42,
      emissive: '#f0e8d6',
      emissiveIntensity: 0.32,
    }),
    plinth: new THREE.MeshStandardMaterial({
      color: '#8f3226',
      roughness: 0.6,
      metalness: 0.08,
      emissive: '#4a1a12',
      emissiveIntensity: 0.2,
    }),
    bumper: new THREE.MeshStandardMaterial({
      color: '#e6a03c',
      roughness: 0.52,
      metalness: 0.06,
      emissive: '#8a5c18',
      emissiveIntensity: 0.22,
    }),
    chrome: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.65 }),
    rail: flat(railMap),
    gondolaHeader: flat(headerMap),
    bands: {
      drinks: flat(makeChillerBandTexture('drinks')),
      chilled: flat(makeChillerBandTexture('chilled')),
      ice: flat(makeChillerBandTexture('ice')),
    },
    ceiling: new THREE.MeshStandardMaterial({
      color: '#f6f2e8',
      roughness: 0.9,
      emissive: '#efe8d8',
      emissiveIntensity: 0.35,
    }),
    // Un commerce est le point le plus lumineux de son décor, et il l'est parce
    // que ses tubes sont NUS : hors éclairage, hors tone mapping, francs de
    // jour et rayonnants la nuit.
    lit: new THREE.MeshBasicMaterial({ color: '#fffdf2', toneMapped: false }),
    goods: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.58, metalness: 0.02 }),
    glow: glowMaterial(glowMap, 0),
    glowSteady: glowMaterial(glowMap, 0.34),
  };
  return pool;
}

/**
 * Un visuel du pool, tiré de façon stable pour une gare et un rang donnés.
 *
 * Le rang avance d'UN par visuel, et pas d'un multiple : c'est la seule façon
 * de garantir que trois affiches voisines soient trois affiches différentes.
 * Un pas de sept, essayé d'abord, retombait sur la même image trois fois de
 * suite dès que le pool comptait quatre entrées - trois posters identiques
 * collés côte à côte sur la même vitrine, ce qu'aucune enseigne ne ferait.
 */
export function pick<T>(list: T[], station: number, i: number): T {
  return list[(((station * 3 + i) % list.length) + list.length) % list.length];
}

/**
 * Allume la flaque de lumière du quai à la tombée du jour.
 *
 * Même règle que les foyers de la voie (three/Wayside) : l'heure dorée compte
 * pour moitié, et de plein jour la flaque disparaît entièrement plutôt que de
 * rester à un fond visible. Le réglage se fait par image parce que l'heure
 * avance en jeu, mais il ne coûte qu'une affectation - aucune géométrie ne
 * bouge, aucune matrice ne se recompose.
 */
export function useShopGlow(): void {
  useFrame(() => {
    const w = dayNightWeights(runtime.clockMin / 60);
    const on = Math.min(1, w.night + w.golden * 0.55);
    const g = shopPool().glow;
    g.opacity = on * 0.5;
    g.visible = on > 0.03;
  });
}

/**
 * Un morceau de marchandise : une matrice, une teinte, et la FAMILLE de forme
 * à laquelle il appartient.
 *
 * Tout était en cubes, et c'est ce qui trahissait le plus vite un rayon : dans
 * un vrai konbini, on distingue à trois mètres une canette d'une brique de
 * lait et d'un pot de nouilles, parce que ce sont trois SILHOUETTES. Alignés en
 * boîtes de la même famille, deux cents produits font une mosaïque, pas un
 * rayon.
 *
 * Deux familles suffisent, et pas une de plus : le PRISME (briques, paquets,
 * boîtes, sachets) et le RÉVOLUTIONNÉ (canettes, bouteilles, pots, gobelets).
 * Une bouteille n'est pas une troisième famille - c'est un corps cylindrique
 * coiffé d'un col plus étroit, donc deux exemplaires de la seconde. Un article
 * coûte ainsi deux ou trois exemplaires au lieu d'un, mais l'ensemble tient
 * toujours en DEUX appels de rendu par boutique.
 */
export type GoodShape = 'box' | 'round';

export interface Good {
  shape: GoodShape;
  m: THREE.Matrix4;
  color: THREE.Color;
}

/** Les matrices et teintes d'une famille, prêtes pour son InstancedMesh. */
export function ofShape(goods: Good[], shape: GoodShape): Good[] {
  return goods.filter((g) => g.shape === shape);
}

/** Assombrit une teinte : le bandeau d'étiquette, ou l'ombre d'un opercule. */
function shade(hex: THREE.Color, k: number): THREE.Color {
  return hex.clone().multiplyScalar(1 - k);
}

const WHITE = new THREE.Color('#f6f2e6');

/**
 * Garnit une étagère : une rangée de produits alignés au nu du rayon.
 *
 * Le rangement suit celui d'un vrai linéaire, et il n'a rien d'un semis :
 *
 *   · les produits sont alignés sur le NEZ de l'étagère, jamais centrés en
 *     profondeur - c'est le facing, et c'est ce qui fait qu'un rayon présente
 *     un front continu plutôt qu'une rangée de plots ;
 *   · le même article se répète deux à cinq fois avant que le suivant
 *     commence. Un rayon où chaque boîte diffère de sa voisine est un
 *     vide-grenier, pas un commerce ;
 *   · la hauteur est bornée par l'entre-étages : une boîte qui traverse
 *     l'étagère du dessus se voit tout de suite, et c'est le genre de faute
 *     qu'aucune texture ne rattrape.
 *
 * `face` vaut +1 ou -1 : le côté de l'étagère vers lequel les produits sont
 * poussés. Une gondole double-face appelle donc deux fois, une contre le mur
 * une seule.
 *
 * `along` dit dans quel sens court le linéaire. Le konbini du hall a ses
 * gondoles en travers du hall (axe x), le kiosque du quai a ses comptoirs le
 * long de la voie (axe z) : c'est la seule chose qui les distingue ici. On
 * pose donc directement dans le bon axe plutôt que de garnir en x et de faire
 * pivoter les matrices - un quart de tour composé à la main sur un échange
 * d'axes retourne le sens de rotation des faces, et les boîtes se retrouvent
 * à l'envers, visibles seulement de l'intérieur.
 */
export interface ShelfSpan {
  /** Bornes de la rangée le long de l'étagère. */
  x0: number;
  x1: number;
  /** Dessus de l'étagère : les produits POSENT dessus. */
  y: number;
  /** Nu du rayon, où s'aligne le front des produits. */
  z: number;
  face: 1 | -1;
  /** Entre-étages : hauteur libre au-dessus de l'étagère. */
  clear: number;
  /** Profondeur disponible derrière le nu. */
  depth: number;
  along?: 'x' | 'z';
}

/**
 * Les quatre articles qui remplissent un konbini, et leurs proportions.
 *
 * Ce ne sont pas des catégories de commerce mais des GABARITS : ce qui compte
 * n'est pas qu'un produit soit du thé ou du dentifrice, c'est qu'il soit haut
 * et mince (brique), bas et large (paquet), rond et court (canette) ou rond et
 * élancé avec un col (bouteille). La proportion fait la reconnaissance.
 */
const KINDS = [
  /** Brique : lait, thé, jus. Haute, étroite, plus profonde que large. */
  { shape: 'box' as const, w: [0.06, 0.085], h: [0.16, 0.24], d: [0.055, 0.075], band: 0.42, neck: 0 },
  /** Paquet et boîte : biscuits, riz, savon. Large, bas, mince. */
  { shape: 'box' as const, w: [0.075, 0.13], h: [0.09, 0.16], d: [0.035, 0.06], band: 0.34, neck: 0 },
  /** Canette : courte, ronde, cerclée d'un bandeau au milieu. */
  { shape: 'round' as const, w: [0.055, 0.068], h: [0.1, 0.135], d: [0, 0], band: 0.5, neck: 0 },
  /** Bouteille : plus haute, corps rond, col étroit et bouchon. */
  { shape: 'round' as const, w: [0.06, 0.075], h: [0.18, 0.26], d: [0, 0], band: 0.4, neck: 0.34 },
] as const;

const span = (r: () => number, [a, b]: readonly [number, number]) => a + r() * (b - a);

export function fillShelf(r: () => number, o: ShelfSpan): Good[] {
  const out: Good[] = [];
  const alongZ = o.along === 'z';
  /** Pose une pièce dans le repère du linéaire, quel que soit son axe. */
  const put = (
    shape: GoodShape,
    run: number,
    y: number,
    front: number,
    a: number,
    h: number,
    b: number,
    color: THREE.Color,
  ) => {
    out.push({
      shape,
      m: alongZ ? mat(front, y, run, b, h, a) : mat(run, y, front, a, h, b),
      color,
    });
  };

  let x = o.x0 + 0.01;
  while (x < o.x1 - 0.05) {
    const kind = KINDS[Math.floor(r() * KINDS.length)];
    const tone = new THREE.Color(goodsTone(r));
    const label = r() > 0.45 ? shade(tone, 0.42) : WHITE;
    const w = span(r, kind.w);
    // La hauteur reste bornée par l'entre-étages : un article qui traverse
    // l'étagère du dessus se voit tout de suite, et aucune texture ne le
    // rattrape. Le col d'une bouteille compte DANS cette hauteur.
    const h = Math.min(o.clear - 0.03, span(r, kind.h));
    const d = kind.shape === 'round' ? w : Math.min(o.depth, span(r, kind.d));
    const bodyH = h * (1 - kind.neck);
    // Un rang est une SÉRIE : le même article se répète deux à cinq fois avant
    // que le suivant commence. C'est le facing d'un vrai linéaire, et c'est ce
    // qui distingue un konbini d'un vide-grenier.
    const facings = 2 + Math.floor(r() * 4);
    for (let f = 0; f < facings && x < o.x1 - w; f++) {
      const run = x + w / 2;
      const front = o.z - o.face * d * 0.5;
      put(kind.shape, run, o.y + bodyH / 2, front, w * 0.94, bodyH, d, tone);
      // Le bandeau d'étiquette : une tranche à peine plus large, d'une autre
      // couleur, en travers du corps. Il ne coûte rien - c'est un exemplaire de
      // plus dans le même InstancedMesh - et c'est LUI qui empêche un rayon
      // d'être une rangée d'aplats.
      put(
        kind.shape,
        run,
        o.y + bodyH * kind.band,
        front,
        w * 0.98,
        bodyH * 0.24,
        d * 1.04,
        label,
      );
      if (kind.neck > 0) {
        // Col et bouchon : deux tranches étroites, et la bouteille se lit.
        put(kind.shape, run, o.y + bodyH + (h - bodyH) * 0.4, front, w * 0.42, (h - bodyH) * 0.8, d * 0.42, tone);
        put(kind.shape, run, o.y + h - (h - bodyH) * 0.12, front, w * 0.5, (h - bodyH) * 0.26, d * 0.5, label);
      }
      x += w + 0.004;
    }
    // Le petit vide entre deux références : un rayon n'est pas soudé.
    x += 0.012 + r() * 0.02;
  }
  return out;
}

/**
 * Garnit un meuble entier : plusieurs étagères régulièrement espacées.
 *
 * `decks` compte les PLATEAUX, pas les étages : le plateau du bas est au ras
 * du socle, celui du haut porte la dernière rangée, et l'entre-étages se
 * déduit. C'est la façon dont on commande un rayonnage, et c'est aussi la
 * seule qui garantisse qu'on ne garnisse pas au-dessus du meuble.
 */
export function fillUnit(
  seed: number,
  o: Omit<ShelfSpan, 'y' | 'clear'> & {
    /** Dessus du socle, et sommet du meuble. */
    y0: number;
    y1: number;
    decks: number;
  },
): Good[] {
  const r = rng(3300 + seed * 7723);
  const pitch = (o.y1 - o.y0) / o.decks;
  const out: Good[] = [];
  for (let k = 0; k < o.decks; k++) {
    out.push(...fillShelf(r, { ...o, y: o.y0 + k * pitch, clear: pitch }));
  }
  return out;
}
