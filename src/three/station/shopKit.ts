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
// nez dessus, sous l'auvent d'un kiosque. Les étagères du premier plan portent
// donc de vraies boîtes - quelques centaines, dans un seul InstancedMesh et un
// seul appel de rendu, teintées par exemplaire. C'est la règle du chantier
// (« ce qui se répète s'instancie ») appliquée à ce qui se répète le plus dans
// une gare : les marchandises.

import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { dayNightWeights } from '../../systems/daynight';
import { runtime } from '../../systems/runtime';
import {
  goodsTone,
  makeChilledCaseTexture,
  makeCoolerDoorTexture,
  makeMagazineRowTexture,
  makeNewspaperRowTexture,
  makePopCardTexture,
  makePromoPosterTexture,
  makeRegisterScreenTexture,
  makeShelfGoodsTexture,
  makeShopFloorTexture,
  makeShopGlowTexture,
  makeShutterTexture,
  makeTobaccoWallTexture,
  makeAutoDoorDecalTexture,
} from '../../textures/konbini';
import { rng } from '../../textures/procedural';
import { mat } from './instancing';

export interface ShopPool {
  /** Pans de rayonnage garnis, vus de face. */
  shelves: THREE.MeshBasicMaterial[];
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
  /** Sol vinyle de la boutique. */
  floor: THREE.MeshStandardMaterial;
  /** Rideau métallique des bouts fermés. */
  shutter: THREE.MeshStandardMaterial;
  /** Tôle laquée du mobilier de vente : gondoles, meubles froids, comptoir. */
  casework: THREE.MeshStandardMaterial;
  /** Nez d'étagère et rails d'étiquettes : plus clairs que la tôle. */
  lip: THREE.MeshStandardMaterial;
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
  });
}

export function shopPool(): ShopPool {
  if (pool) return pool;
  const flat = (t: THREE.Texture) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  const floorMap = makeShopFloorTexture();
  // Un carreau de vinyle fait soixante centimètres : la répétition suit le
  // meuble qui la porte, pas l'inverse.
  floorMap.repeat.set(6, 3);
  const shutterMap = makeShutterTexture();
  shutterMap.repeat.set(3, 1);
  const glowMap = makeShopGlowTexture();

  pool = {
    shelves: [0, 1, 2, 3].map((i) => flat(makeShelfGoodsTexture(i, i === 3 ? 4 : 5))),
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
    }),
    floor: new THREE.MeshStandardMaterial({
      map: floorMap,
      roughness: 0.62,
      metalness: 0.02,
      emissive: '#d8d5cc',
      emissiveIntensity: 0.24,
    }),
    shutter: new THREE.MeshStandardMaterial({
      map: shutterMap,
      roughness: 0.44,
      metalness: 0.55,
    }),
    // Le mobilier de vente est de la tôle laquée BLANCHE sous des tubes nus :
    // sans rappel d'émissif, il prenait le gris du hall à travers la vitrine et
    // la boutique paraissait éteinte de l'extérieur - l'inverse exact de ce
    // qu'un konbini fait à un couloir de gare.
    casework: new THREE.MeshStandardMaterial({
      color: '#f4f3ee',
      roughness: 0.5,
      metalness: 0.08,
      emissive: '#e8e6de',
      emissiveIntensity: 0.28,
    }),
    lip: new THREE.MeshStandardMaterial({
      color: '#fdfcf8',
      roughness: 0.42,
      emissive: '#f2f0e8',
      emissiveIntensity: 0.3,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      color: '#f6f5f0',
      roughness: 0.9,
      emissive: '#efeee8',
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

/** Une marchandise posée sur une étagère : sa matrice et sa teinte. */
export interface Good {
  m: THREE.Matrix4;
  color: THREE.Color;
}

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

export function fillShelf(r: () => number, o: ShelfSpan): Good[] {
  const out: Good[] = [];
  const alongZ = o.along === 'z';
  let x = o.x0 + 0.01;
  while (x < o.x1 - 0.05) {
    const tone = goodsTone(r);
    const w = 0.045 + r() * 0.075;
    const h = Math.min(o.clear - 0.03, 0.08 + r() * 0.2);
    const d = Math.min(o.depth, 0.05 + r() * 0.12);
    const facings = 1 + Math.floor(r() * 4);
    for (let f = 0; f < facings && x < o.x1 - w; f++) {
      const run = x + w / 2;
      const front = o.z - o.face * d * 0.5;
      out.push({
        m: alongZ
          ? mat(front, o.y + h / 2, run, d, h, w * 0.92)
          : mat(run, o.y + h / 2, front, w * 0.92, h, d),
        color: new THREE.Color(tone),
      });
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
