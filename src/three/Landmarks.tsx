// Silhouettes 3D du bord de voie par gare (tours, écrans géants, tram,
// monorail…) qui APPARAISSENT en fondu à l'approche de leur station et
// disparaissent après.
//
// --- DEUX FAMILLES, ET IL FAUT LES DISTINGUER ---
//
// Ce composant en portait une seule, appelée « repères », et c'était un abus de
// langage : le tram d'Ōtsuka existe, l'écran géant d'Akihabara est un décor
// plausible, et la tour treillis de Nippori n'existait nulle part. La bible
// géographique demande (règle 12) qu'un repère soit un objet retrouvable sur
// une carte, et (règle 11) qu'on n'en invente aucun.
//
// Chaque silhouette déclare donc ce qu'elle est (`truth`, data/districts) :
//
//   · 'geo'     un objet RÉEL, résolu par gare et par famille dans
//               src/data/nearLandmarks (import OpenStreetMap). Son côté n'est
//               plus écrit à la main mais LU SUR LE TERRAIN à chaque image :
//               le Musée national est au nord d'Ueno, il passe donc à gauche en
//               内回り et à droite en 外回り, et le jeu n'a rien à en savoir.
//               Si le relevé ne résout rien pour cette gare, rien n'est posé.
//   · 'station' un fait de la gare elle-même - sa marquise, la ligne qui la
//               longe, la locomotive de son parvis.
//   · 'fabric'  du tissu urbain, jamais présenté comme un repère.
//
// La distance, elle, reste stylisée à trente-quatre mètres pour tout le monde,
// et c'est un choix assumé : un objet réel posé à ses trois cents mètres serait
// derrière le ruban urbain, invisible. La couche qui pose les distances vraies
// est ailleurs - c'est three/city/DistrictMassif pour les masses et
// three/city/FarSkyline pour les repères d'horizon. Ici, une silhouette est une
// CITATION : ce qu'elle promet, c'est le bon objet du bon côté.
//
// Deux « slots » ping-pong (arrivant / partant) comme les banques de ville :
// au changement de gare, le slot devenu arrivant est reconstruit depuis
// DISTRICTS[index].landmarks (invisible à cet instant, donc sans à-coup).
//
// Convention de repère LOCAL :
//   · lointain (far) : le groupe est tourné pour que +z pointe vers la voie ;
//     l'axe X local court le long des rails, Y vers le haut, +Z vers le train.
//   · proche (near) : pas de rotation ; l'axe Z local court le long des rails
//     et le repère défile en z (idiome des poteaux/arbres).

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { seasonNow } from '../systems/season';
import { useStore } from '../store';
import { CONFIG } from '../data/config';
import { prevStation } from '../data/loop';
import { journeyProgress } from '../data/segments';
import { DISTRICTS, LAND_FAMILY, type Land, type LandmarkSpec } from '../data/districts';
import { GEO_LANDMARKS, type GeoLandmark } from '../data/tokyoGeo';
import { NEAR_DATED, STATION_DATED, factVisible } from '../data/geo/provenance';
import { loopPose, makePose, sightTo, type Sight } from '../systems/tokyoBearing';
import { rng } from '../textures/procedural';
import { box, glow, mergeByMaterial, plane, sil, vehicle, type Ctx } from './landmarkKit';
import { landmarkPush } from '../systems/stationOcclusion';

const BASE_Y = -1.1; // niveau du sol extérieur.
const FAR_X = 34; // distance latérale des silhouettes (devant la couche lointaine).
// Deux positions le long de la voie : visibles par les baies latérales quand on
// regarde chaque fond du wagon (pas seulement dehors à gauche / à droite).
// L'ancienne valeur unique FAR_Z = -5 les plaçait derrière le regard initial.
const FAR_ZS = [-32, 28] as const;
const NEAR_X = 8; // repères au niveau de la voie.
const NEAR_SPAN = 100; // période de défilement des repères proches (m).

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// (Ctx et les primitives sil/glow/box/plane/vehicle vivent dans landmarkKit,
// partagées avec SegmentEnvironment.)
function sphere(ctx: Ctx, mat: THREE.Material, rad: number, x: number, y: number, z: number): void {
  const g = new THREE.SphereGeometry(rad, 12, 10);
  ctx.geos.push(g);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.scale.y = 0.9;
  ctx.group.add(m);
}

// --- Briques de construction paramétriques ---

// Grappe de tours : boîtes + bandeau de fenêtres émissif face à la voie.
function towers(ctx: Ctx, n: number, body: string, win: string, wBase: number, hBase: number): void {
  const mat = sil(ctx, body);
  const winMat = glow(ctx, win);
  for (let i = 0; i < n; i++) {
    const w = wBase * (0.7 + ctx.r() * 0.6);
    const h = hBase * (0.6 + ctx.r() * 0.75);
    const px = (i - (n - 1) / 2) * wBase * 1.15 + (ctx.r() - 0.5) * 3;
    const pz = (ctx.r() - 0.5) * 5;
    box(ctx, mat, w, h, w * 0.85, px, h / 2, pz);
    plane(ctx, winMat, w * 0.72, h * 0.9, px, h * 0.52, pz + w * 0.44);
  }
}

// Masse d'arbres (parc, forêt de sanctuaire).
//
// Le bois de Meiji-jingū et la lisière d'Ueno sont les deux seuls repères de la
// boucle qui soient faits de végétal : ils prennent la couleur du jour. Les
// silhouettes étant rebâties à chaque changement de gare, il suffit de lire la
// saison ici - pas d'uniforme à piloter.
function forest(ctx: Ctx, spread: number): void {
  const se = seasonNow();
  const trunk = sil(ctx, '#5a4632');
  const leafA = sil(ctx, se.foliage[0]);
  const leafB = sil(ctx, se.foliage[2]);
  const n = 6 + Math.floor(ctx.r() * 5);
  for (let i = 0; i < n; i++) {
    const px = (ctx.r() - 0.5) * spread * 2;
    const pz = (ctx.r() - 0.5) * spread;
    const th = 4 + ctx.r() * 5;
    box(ctx, trunk, 0.5, th * 0.5, 0.5, px, th * 0.25, pz);
    sphere(ctx, i % 2 ? leafA : leafB, th * (0.42 + ctx.r() * 0.2), px, th * 0.62, pz);
  }
}

// Immeuble à écrans géants émissifs (Shibuya, Shinjuku, Akihabara).
function screenWall(ctx: Ctx, w: number, h: number): void {
  const mat = sil(ctx, '#2a2e36');
  box(ctx, mat, w, h, w * 0.5, 0, h / 2, 0);
  const cols = ['#8fd0ff', '#ff6a8a', '#ffd24a'];
  for (let i = 0; i < 3; i++) {
    const sw = w * (0.5 + ctx.r() * 0.35);
    const sh = h * (0.18 + ctx.r() * 0.12);
    const sy = h * (0.3 + i * 0.22);
    const g = glow(ctx, cols[i % cols.length]);
    plane(ctx, g, sw, sh, (ctx.r() - 0.5) * w * 0.3, sy, w * 0.26);
  }
}

// Façade basse à arches / colonnes (gare de brique, musée, brasserie).
function lowFacade(ctx: Ctx, w: number, h: number, color: string, columns: boolean): void {
  const mat = sil(ctx, color);
  box(ctx, mat, w, h, 6, 0, h / 2, 0);
  // Toit / corniche.
  box(ctx, sil(ctx, '#3a4048'), w * 1.02, h * 0.14, 6.4, 0, h * 1.02, 0);
  if (columns) {
    const cm = sil(ctx, '#e8e2d4');
    const n = Math.round(w / 4);
    for (let i = 0; i < n; i++) {
      const px = -w / 2 + 2 + i * 4;
      box(ctx, cm, 0.8, h * 0.8, 0.8, px, h * 0.4, 3.1);
    }
  } else {
    // Dômes / pignons de brique.
    const dm = sil(ctx, color);
    box(ctx, dm, w * 0.16, h * 0.3, 3, -w * 0.32, h * 1.12, 0);
    box(ctx, dm, w * 0.16, h * 0.3, 3, w * 0.32, h * 1.12, 0);
  }
}

// Stèle de site historique : socle, colonne gravée, haie basse.
//
// C'est la forme la plus commune de ce que la famille `historic` recouvre à
// Tokyo - un 記念碑, un 跡地, un 史跡 -, et la seule qu'on puisse dessiner sans
// rien inventer : ces objets n'ont pas de bâtiment, ils ont un marqueur. Sans
// elle, trente objets relevés restaient dans les données sans pouvoir arriver
// à l'écran.
function stoneMarker(ctx: Ctx, h: number): void {
  const stone = sil(ctx, '#b9b2a6');
  const dark = sil(ctx, '#8d8578');
  box(ctx, dark, 5.2, 0.7, 4.4, 0, 0.35, 0);
  box(ctx, stone, 3.2, 0.6, 2.8, 0, 0.95, 0);
  box(ctx, stone, 1.1, h, 0.9, 0, 1.25 + h / 2, 0);
  box(ctx, dark, 1.4, 0.35, 1.2, 0, 1.25 + h + 0.18, 0);
  const hedge = sil(ctx, seasonNow().foliage[1]);
  box(ctx, hedge, 9, 1.2, 0.9, 0, 0.6, -2.6);
  box(ctx, hedge, 9, 1.2, 0.9, 0, 0.6, 2.6);
}

// Toit de temple à croupe (tuiles sombres), sur un corps clair.
function templeRoof(ctx: Ctx, w: number, h: number): void {
  box(ctx, sil(ctx, '#d8cdb8'), w, h, 5, 0, h / 2, 0);
  const roof = sil(ctx, '#39414a');
  box(ctx, roof, w * 1.25, h * 0.16, 6.5, 0, h + h * 0.1, 0);
  box(ctx, roof, w * 0.9, h * 0.16, 5.4, 0, h + h * 0.34, 0);
  box(ctx, sil(ctx, '#2a3038'), w * 1.28, 0.4, 0.6, 0, h + h * 0.02, 3.3);
}

// Tour cylindrique mode (façon 109) avec bandeaux lumineux.
function cylinder(ctx: Ctx, h: number): void {
  const bodyMat = sil(ctx, '#d8d2cc');
  const g = new THREE.CylinderGeometry(4, 5, h, 18, 1, false);
  ctx.geos.push(g);
  const m = new THREE.Mesh(g, bodyMat);
  m.position.set(0, h / 2, 0);
  ctx.group.add(m);
  for (let i = 0; i < 4; i++) {
    const bg = glow(ctx, i % 2 ? '#ff5a8a' : '#8fd0ff');
    plane(ctx, bg, 7, h * 0.1, 0, h * (0.25 + i * 0.18), 4.6);
  }
}

// Façade d'enseignes empilées lumineuses (Koreatown, arcades).
function stackedSign(ctx: Ctx, w: number, h: number): void {
  box(ctx, sil(ctx, '#332e30'), w, h, 4, 0, h / 2, 0);
  const cols = ['#ff6fae', '#ffd24a', '#8fd0ff', '#ff8f5a'];
  const n = Math.floor(h / 2.4);
  for (let i = 0; i < n; i++) {
    const g = glow(ctx, cols[i % cols.length]);
    plane(ctx, g, w * 0.86, 1.6, 0, 1.6 + i * 2.4, 2.1);
  }
}

// Poutre de monorail surélevée (near) le long de +z.
function monorailBeam(ctx: Ctx, len: number): void {
  const mat = sil(ctx, '#c8c8cc');
  box(ctx, mat, 1.4, 1.2, len, 0, 6.5, 0); // poutre
  const n = Math.round(len / 12);
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + 6 + i * 12;
    box(ctx, mat, 1.0, 6.5, 1.0, 0, 3.25, z); // pile
  }
}

// Verrière blanche moderne (Takanawa Gateway).
function whiteRoof(ctx: Ctx, w: number): void {
  const mat = sil(ctx, '#eef0f2');
  box(ctx, mat, w, 0.6, 12, 0, 9, 0);
  const beams = sil(ctx, '#d6dade');
  for (let i = 0; i < 6; i++) {
    const px = -w / 2 + 2 + i * (w / 6);
    box(ctx, beams, 0.5, 9, 0.5, px, 4.5, -5);
    box(ctx, beams, 0.5, 11, 0.5, px, 5.5, 5);
  }
}

// Arche vitrée (Yebisu Garden Place).
function gardenArch(ctx: Ctx, h: number): void {
  const mat = sil(ctx, '#a6bcd0');
  box(ctx, mat, 12, h, 6, 0, h / 2, 0);
  const g = new THREE.CylinderGeometry(6, 6, 6, 16, 1, false, 0, Math.PI);
  ctx.geos.push(g);
  const arch = sil(ctx, '#b8ccdc');
  const m = new THREE.Mesh(g, arch);
  m.rotation.z = Math.PI / 2;
  m.rotation.y = Math.PI / 2;
  m.position.set(0, h, 0);
  ctx.group.add(m);
  plane(ctx, glow(ctx, '#cfe4f4'), 9, h * 0.8, 0, h * 0.5, 3.05);
}

// --- Registre : quels builders + proche/lointain par type ---
interface Builder {
  near: boolean;
  build: (ctx: Ctx) => void;
}

const BUILDERS: Record<Land, Builder> = {
  glassTowerCluster: { near: false, build: (c) => towers(c, 4, '#8ea6c4', '#bcd8ff', 9, 26) },
  boxyTower: { near: false, build: (c) => towers(c, 3, '#9a8f7a', '#ffe6b0', 11, 30) },
  twinTowers: { near: false, build: (c) => towers(c, 2, '#8a94a4', '#cfe0f2', 10, 32) },
  officeBlock: { near: false, build: (c) => towers(c, 2, '#9aa2ac', '#d6e2ee', 9, 20) },
  giantScreenWall: { near: false, build: (c) => screenWall(c, 16, 20) },
  cylinderFashion: { near: false, build: (c) => cylinder(c, 22) },
  forestMass: { near: false, build: (c) => forest(c, 13) },
  museumFacade: { near: false, build: (c) => lowFacade(c, 24, 11, '#d8cfc0', true) },
  templeRoof: { near: false, build: (c) => templeRoof(c, 12, 6) },
  stoneMarker: { near: false, build: (c) => stoneMarker(c, 4) },
  tramCar: { near: true, build: (c) => vehicle(c, 'tram') },
  monorailBeam: { near: true, build: (c) => monorailBeam(c, NEAR_SPAN) },
  shinkansenSet: { near: true, build: (c) => vehicle(c, 'shinkansen') },
  steamLoco: { near: true, build: (c) => vehicle(c, 'loco') },
  gardenPlaceArch: { near: false, build: (c) => gardenArch(c, 18) },
  whiteLatticeRoof: { near: false, build: (c) => whiteRoof(c, 22) },
  stackedSignFacade: { near: false, build: (c) => stackedSign(c, 12, 18) },
};

// --- État d'un slot (arrivant / partant) ---
interface SlotItem {
  group: THREE.Group;
  near: boolean;
  phase: number; // décalage z du défilement (near).
  side: 1 | -1;
  /** Abscisse au repos, avant l'écartement dû à une gare. */
  baseX: number;
  /**
   * L'objet réel que la silhouette cite, ou `null` pour un fait de gare et pour
   * le tissu. Quand il y en a un, c'est LUI qui décide du côté. On le lit dans
   * GEO_LANDMARKS (bande near) : le même jeu que FarSkyline pour l'horizon.
   */
  geo: GeoLandmark | null;
}

/**
 * L'objet réel qui porte une silhouette, ou `null`.
 *
 * Le quartier dit « ici il y a un parc » ; le relevé dit lequel, et où. Une
 * silhouette réelle dont la gare ne résout rien n'est pas dessinée : c'est le
 * cas d'Ōsaki, qui n'a pas de temple relevé, et c'est très bien ainsi.
 *
 * La table est GEO_LANDMARKS, bande near : le relais proche / lointain n'a qu'un
 * jeu de données. nearLandmarks.ts reste le relevé détaillé (Wikidata, OSM) ;
 * tokyoGeo en porte la projection pour le rendu.
 */
function geoOf(spec: LandmarkSpec, station: number, rank: number): GeoLandmark | null {
  if (spec.truth !== 'geo') return null;
  const family = LAND_FAMILY[spec.kind];
  if (!family) return null;
  return (
    GEO_LANDMARKS.find(
      (lm) =>
        lm.band === 'near' && lm.station === station && lm.family === family && lm.rank === rank,
    ) ?? null
  );
}

/** La silhouette d'office de chaque famille, quand le quartier n'en nomme pas. */
const AUTO_KIND: Record<NonNullable<GeoLandmark['family']>, Land> = {
  museum: 'museumFacade',
  worship: 'templeRoof',
  park: 'forestMass',
  historic: 'stoneMarker',
};

/**
 * Combien d'objets RÉELS une gare cite au plus.
 *
 * Quatre, soit une silhouette par famille. Ce n'est pas une limite de coût -
 * seul le quartier courant est peuplé, et une silhouette pèse quelques dizaines
 * de triangles - mais de composition : au-delà, le bord de voie devient une
 * vitrine et on ne lit plus rien.
 */
const GEO_BUDGET = 4;

/**
 * Les silhouettes d'un quartier : celles qu'il nomme, plus celles que le relevé
 * résout et qu'il ne nommait pas.
 *
 * C'était le vrai plafond, et il n'était pas dans les données. `districts.ts`
 * ne déclarait que quatorze emplacements `truth: 'geo'` sur toute la boucle
 * alors que le relevé résolvait quatre-vingt-neuf couples gare × famille :
 * Hamamatsuchō avait le 旧芝離宮恩賜庭園 à cent trente-neuf mètres et ne le
 * citait pas, faute d'une ligne écrite à la main. Les quartiers gardent la
 * composition qu'on leur a donnée - le tissu, les échelles, les côtés - et le
 * reste vient du terrain.
 */
function specsFor(districtIndex: number): LandmarkSpec[] {
  const authored = DISTRICTS[districtIndex]?.landmarks ?? [];
  const specs = [...authored];
  const covered = new Set<string>();
  for (const spec of authored) {
    if (spec.truth !== 'geo') continue;
    const family = LAND_FAMILY[spec.kind];
    if (family) covered.add(family);
  }
  for (const lm of GEO_LANDMARKS) {
    if (specs.length - authored.length + covered.size >= GEO_BUDGET) break;
    if (lm.band !== 'near' || lm.station !== districtIndex || lm.rank !== 0) continue;
    if (!lm.family || covered.has(lm.family)) continue;
    covered.add(lm.family);
    specs.push({ kind: AUTO_KIND[lm.family], truth: 'geo' });
  }
  return specs;
}
interface Slot {
  root: THREE.Group;
  district: number;
  items: SlotItem[];
  sil: THREE.MeshBasicMaterial[];
  glow: THREE.MeshBasicMaterial[];
  geos: THREE.BufferGeometry[];
}

function disposeSlot(slot: Slot): void {
  for (const m of slot.sil) m.dispose();
  for (const m of slot.glow) m.dispose();
  for (const g of slot.geos) g.dispose();
  slot.root.clear();
  slot.items = [];
  slot.sil = [];
  slot.glow = [];
  slot.geos = [];
}

function populate(slot: Slot, districtIndex: number): void {
  disposeSlot(slot);
  slot.district = districtIndex;
  const specs = specsFor(districtIndex);
  // Deux silhouettes d'une même famille dans un quartier citent DEUX objets :
  // la seconde prend le rang suivant du relevé. Sans ce compteur, elles
  // pointeraient toutes les deux sur le premier.
  const used = new Map<string, number>();
  specs.forEach((spec: LandmarkSpec, i: number) => {
    const builder = BUILDERS[spec.kind];
    if (!builder) return;
    const family = spec.truth === 'geo' ? LAND_FAMILY[spec.kind] : undefined;
    const rank = family ? (used.get(family) ?? 0) : 0;
    if (family) used.set(family, rank + 1);
    // Une silhouette réelle sans objet résolu ne se pose pas. C'est la règle 11
    // appliquée à la lettre : plutôt un quartier nu qu'un temple imaginaire.
    const geo = geoOf(spec, districtIndex, rank);
    if (spec.truth === 'geo' && !geo) return;
    // Faits datés : Takanawa Gateway avant 2020, Miyashita Park reconstruit…
    if (spec.truth === 'geo' && geo && !factVisible(NEAR_DATED[geo.id], runtime.tokyoDate)) return;
    const datedKey = `${districtIndex}:${spec.kind}`;
    if (!factVisible(STATION_DATED[datedKey], runtime.tokyoDate)) return;
    const side = spec.side ?? 1;
    const scale = spec.scale ?? 1;
    const zs = builder.near ? [0] : [...FAR_ZS];
    zs.forEach((z, zi) => {
      const itemGroup = new THREE.Group();
      const ctx: Ctx = {
        group: itemGroup,
        sil: slot.sil,
        glow: slot.glow,
        geos: slot.geos,
        r: rng(700 + districtIndex * 53 + i * 131 + spec.kind.length * 7 + zi * 17),
      };
      builder.build(ctx);
      // Une silhouette, c'est jusqu'à vingt-deux boîtes pour trois teintes : on
      // les fond avant de la poser, sinon chaque boîte se paie un appel de rendu.
      mergeByMaterial(itemGroup, slot.geos);
      itemGroup.scale.setScalar(scale);
      const baseX = builder.near ? NEAR_X : FAR_X;
      if (builder.near) {
        itemGroup.position.set(side * NEAR_X, BASE_Y, 0);
      } else {
        itemGroup.position.set(side * FAR_X, BASE_Y, z);
        // Oriente +z local vers la voie (x=0).
        itemGroup.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
      }
      slot.root.add(itemGroup);
      slot.items.push({
        group: itemGroup,
        near: builder.near,
        phase: i * 23 + zi * 41,
        side,
        baseX,
        geo,
      });
    });
  });
}

/** Objets de travail du relèvement : aucune allocation par image. */
const geoScratch = {
  pose: makePose(),
  sight: { azimuth: 0, distance: 0 } as Sight,
};

export function Landmarks() {
  const rootA = useRef<THREE.Group>(null);
  const rootB = useRef<THREE.Group>(null);
  const slots = useRef<[Slot, Slot] | null>(null);
  const arrivingSlot = useRef<0 | 1>(0);
  const lastIndex = useRef<number>(CONFIG.startIndex);

  useEffect(() => {
    if (!rootA.current || !rootB.current) return;
    const mk = (root: THREE.Group): Slot => ({ root, district: -1, items: [], sil: [], glow: [], geos: [] });
    const pair: [Slot, Slot] = [mk(rootA.current), mk(rootB.current)];
    slots.current = pair;
    populate(pair[0], CONFIG.startIndex);
    populate(pair[1], prevStation(CONFIG.startIndex, useStore.getState().loopDirection));
    return () => {
      disposeSlot(pair[0]);
      disposeSlot(pair[1]);
    };
  }, []);

  useFrame(() => {
    const pair = slots.current;
    if (!pair) return;
    const { index, phase, loopDirection } = useStore.getState();

    // Changement de gare : bascule et reconstruction du nouveau slot arrivant.
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      arrivingSlot.current = arrivingSlot.current === 0 ? 1 : 0;
      populate(pair[arrivingSlot.current], index);
    }

    const p = journeyProgress(phase, runtime.phaseT, index, loopDirection);
    // La pose géographique du train, pour les silhouettes qui citent un objet
    // réel : c'est elle qui dit de quel côté il passe.
    const { pose, sight } = geoScratch;
    loopPose(index, p, loopDirection, pose);
    const closeArr = smoothstep(0.55, 1.0, p);
    const closeDep = smoothstep(0.55, 1.0, 1 - p);

    const w = dayNightWeights(runtime.clockMin / 60);
    const cityNight = Math.min(1, w.night + w.golden * 0.45);
    const silDay = 1 - 0.5 * cityNight; // silhouettes : plus sombres la nuit.
    const glowLvl = 0.28 + 0.72 * cityNight; // écrans/néons : éclatants la nuit.

    const arriving = arrivingSlot.current;
    for (let s = 0; s < 2; s++) {
      const slot = pair[s];
      const closeness = s === arriving ? closeArr : closeDep;
      const visible = closeness > 0.02;
      slot.root.visible = visible;
      if (!visible) continue;
      // depthWrite dès que le fondu est avancé : sinon les silhouettes
      // transparentes se mélangent en gros blocs lavés.
      const writeDepth = closeness > 0.88;
      for (const m of slot.sil) {
        m.opacity = closeness;
        m.depthWrite = writeDepth;
        const base = m.userData.base as THREE.Color | undefined;
        if (base) m.color.copy(base).multiplyScalar(silDay);
      }
      for (const m of slot.glow) {
        m.opacity = closeness * glowLvl;
        m.depthWrite = writeDepth;
      }
      for (const item of slot.items) {
        // Un objet réel passe du côté où il est. Le relèvement le dit à chaque
        // image : `sin` positif, il est à droite du sens de marche. La bascule
        // ne se fait qu'au-delà d'un quart, ce qui évite qu'un objet presque
        // dans l'axe hésite d'une image à l'autre - et un objet dans l'axe est
        // devant ou derrière, pas d'un côté.
        if (item.geo) {
          sightTo(pose, item.geo.x, item.geo.z, sight);
          const lateral = Math.sin(sight.azimuth);
          if (Math.abs(lateral) > 0.25) {
            const side: 1 | -1 = lateral >= 0 ? 1 : -1;
            if (side !== item.side) {
              item.side = side;
              if (!item.near) item.group.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
            }
          }
        }
        // À l'approche d'une gare, le repère se range derrière elle : la gare
        // s'étend désormais jusqu'au quai d'en face, et le tram d'Ōtsuka comme
        // la poutre de monorail de Hamamatsuchō tombaient dedans.
        item.group.position.x = item.side * (item.baseX + landmarkPush(item.side, item.baseX));
        // Défilement des repères proches (tram, viaduc, monorail…).
        if (!item.near) continue;
        item.group.position.z = ((runtime.distance + item.phase) % NEAR_SPAN) - NEAR_SPAN / 2;
      }
    }
  });

  return (
    <>
      <group ref={rootA} />
      <group ref={rootB} />
    </>
  );
}
