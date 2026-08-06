// Ce qui n'arrive qu'une fois sur la boucle.
//
// Trois ouvrages, et aucun n'est décoratif (voir data/segments et
// systems/singularity) :
//
//   · LE PASSAGE À NIVEAU. Le 第二中里踏切, entre Tabata et Komagome, est le
//     seul de toute la Yamanote - et l'un des derniers du centre de Tokyo. Une
//     ligne qui passe toutes les deux minutes ne peut pas s'offrir des
//     barrières : celles-ci restent baissées la plupart du temps, et c'est
//     pour ça qu'on les voit fermées quand la rame arrive. Elles le sont donc
//     ici, feux battants, comme sur place.
//   · LES TRAVERSÉES DE RIVIÈRE. La Kanda au nord de Kanda, la Shibuya au sud
//     de Shibuya, la Meguro entre Gotanda et Ōsaki. Ce sont les trouées les plus
//     larges du parcours : rien ne se construit sur une rivière, et le tissu
//     s'ouvre des deux côtés en même temps. Un chenal de béton entre deux murs,
//     comme toutes les rivières de Tokyo depuis les années soixante.
//   · L'AUTOROUTE URBAINE. Le 首都高 ne traverse pas la ville au hasard : il
//     suit les avenues et les rivières, et sur trois tronçons il suit la voie -
//     un tablier de quinze mètres sur ses piles, au-dessus du premier rang bâti,
//     qui accompagne la rame une minute entière.
//
// Tout est posé DANS LE MONDE, à une abscisse fixe que le train dépasse
// (l'idiome de three/city/CityRibbon) : le groupe recule d'un `runtime.distance`
// et rien ne défile par rapport au décor. La rivière et le passage à niveau
// tournent en plus dans la trame du quartier, parce qu'ils empruntent une rue.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { segEnv } from '../systems/segmentEnv';
import { expressway, singularity } from '../systems/singularity';
import { plateauRuntime } from '../systems/plateau';
import { hiddenByStation, sidePush } from '../systems/stationOcclusion';
import { qualityLevel, usePerf, type Quality } from '../systems/perf';
import { weather } from '../systems/weather';
import { makeWaterTexture } from '../textures/procedural';

/** Demi-longueur de la chaussée du passage à niveau (m). */
const ROAD_HALF = 74;
/** Largeur de la chaussée (m) : une ruelle à voie unique, comme le vrai. */
const ROAD_W = 7;
/**
 * Cote de la chaussée LOIN de la voie (m au-dessus du sol de la ville).
 *
 * La dalle de rue du générateur monte à 14 cm (`buildCellProps`) et la
 * singularité s'ancre justement SUR une rue : la chaussée passe donc au-dessus
 * d'elle, sans quoi les deux surfaces clignotent l'une dans l'autre sur toute
 * la trouée.
 */
const ROAD_Y = 0.17;
/**
 * Cote du platelage AU DROIT DE LA VOIE (m au-dessus du sol de la ville).
 *
 * Négative, et c'est là tout le sujet : dans un passage à niveau la route se met
 * au niveau du RAIL. La plate-forme est un plan texturé posé cinq centimètres
 * plus bas que le sol urbain (three/Wayside), et le platelage vient deux
 * centimètres au-dessus d'elle. Réglé à la cote de la rue, il devenait une
 * planche jetée en travers de la voie : elle masquait les rails, portait son
 * ombre sur le ballast, et se lisait tout de suite comme une erreur.
 */
const DECK_Y = -0.03;
/** Demi-largeur du platelage (m) : l'emprise de la plate-forme, et rien de plus. */
const DECK_HALF = 5.6;
/** Abscisse où la chaussée a fini de remonter à la cote de la rue (m). */
const RAMP_OUT = 7.2;
/** Demi-écartement de la voie (m) : les rails restent lisibles sur le platelage. */
const GAUGE_X = 0.7175;
/** Épaisseur de la chaussée et du platelage (m). */
const ROAD_T = 0.16;
/** Demi-longueur du chenal (m) : jusqu'au dernier rang proche, pas au-delà. */
const RIVER_HALF = 66;
/** Largeur de la nappe d'eau (m). */
const WATER_W = 24;
/**
 * Cote de la nappe (m au-dessus du sol de la ville).
 *
 * Elle est POSITIVE, ce qui est le contraire de ce qu'on attend d'une rivière -
 * et c'est un choix contraint. La rivière s'ancre sur une rue, donc sur la dalle
 * de chaussée du générateur (14 cm) : creuser demanderait de percer un trou dans
 * la nappe de sol urbain, qui est un plan d'un seul tenant. Ce sont donc les MURS
 * de berge qui creusent, en montant deux mètres trente au-dessus de l'eau -
 * exactement la lecture qu'on a d'un 三面張り depuis un viaduc.
 */
const WATER_Y = 0.2;
/** Hauteur des murs de berge au-dessus de l'eau (m). */
const BANK_H = 2.5;

/** Longueur d'une travée d'autoroute (m). */
const SEC = 34;
/** Nombre de travées portées : 408 m, la portée de la brume de jour. */
const SEC_COUNT = 12;
/** Pile intérieure (m) : entre l'emprise ferroviaire et les poteaux de rue. */
const PIER_IN = 9.4;
/** Pile extérieure (m) : le joint entre le premier et le deuxième rang bâti. */
const PIER_OUT = 21.5;
/**
 * Sous-face du tablier au-dessus de la rue (m).
 *
 * Treize mètres quarante, et ce n'est pas un chiffre rond par hasard : le
 * premier rang bâti plafonne à 12,7 m (`RANKS[0]`, hauteur maximale × densité
 * maximale). Le tablier passe donc au-dessus de TOUT le premier rang, sans
 * qu'il faille creuser une trouée dans la ville pour l'y faire tenir.
 */
const DECK_CLEAR = 13.4;

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cylAt(rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

// --- Le passage à niveau ----------------------------------------------------
//
// Un ensemble par côté de la voie : le fût du 遮断機 avec sa lisse, et le mât du
// 警報機 avec son damier et ses deux feux. Les deux tiennent dans la MÊME matrice
// d'instance - ils sont solidaires sur place, plantés dans le même trottoir - ce
// qui divise par deux le nombre de maillages à écrire.

/** Position du fût de barrière (m à l'axe) et du mât d'alarme, derrière lui. */
const BOOM_X = 7.6;
const SIGNAL_X = 9.8;
/** Bord de chaussée où l'ensemble est planté (m). */
const KERB_Z = 3.9;
/** Cote de la lisse baissée (m au-dessus de la chaussée). */
const BOOM_Y = 1.05;
/** Nombre de tronçons peints de la lisse : la lisse fait 7,2 m. */
const BOOM_PARTS = 8;
const BOOM_LEN = 0.9;

/** Fûts, mâts et bâtis : tout ce qui est en acier peint gris. */
function buildCrossingSteel(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Massif et fût du 遮断機, avec son carter de mécanisme.
  parts.push(boxAt(0.62, 0.3, 0.62, BOOM_X, 0.15, KERB_Z));
  parts.push(cylAt(0.1, 0.12, BOOM_Y - 0.1, 8, BOOM_X, (BOOM_Y - 0.1) / 2 + 0.3, KERB_Z));
  parts.push(boxAt(0.34, 0.46, 0.3, BOOM_X, BOOM_Y + 0.12, KERB_Z));
  // Contrepoids : la fonte au pied du balancier, sans quoi une lisse de sept
  // mètres ne se lèverait pas.
  parts.push(cylAt(0.17, 0.17, 0.24, 10, BOOM_X, BOOM_Y + 0.12, KERB_Z + 0.46));
  // Mât du 警報機 : plus haut, planté derrière, avec la console des feux.
  parts.push(cylAt(0.07, 0.09, 2.5, 8, SIGNAL_X, 1.25, KERB_Z));
  parts.push(boxAt(0.1, 0.1, 1.0, SIGNAL_X, 2.28, KERB_Z));
  return merge(parts);
}

/** Abscisse du i-ième tronçon peint de la lisse, en travers de la chaussée. */
function boomZ(i: number): number {
  return KERB_Z - 0.55 - (i + 0.5) * BOOM_LEN;
}

/** Ce qui est peint en jaune : un tronçon de lisse sur deux, et le damier. */
function buildCrossingWarn(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < BOOM_PARTS; i += 2) {
    parts.push(boxAt(0.1, 0.15, BOOM_LEN, BOOM_X, BOOM_Y, boomZ(i)));
  }
  // Le damier du 警報機 : deux barres croisées au-dessus des feux, tournées vers
  // la chaussée. Elles se croisent AVANT d'être posées - une rotation appliquée
  // après la translation les enverrait tourner autour de l'axe de la voie.
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.06, 1.34, 0.14);
    g.rotateX(s * 0.7);
    g.translate(SIGNAL_X, 2.98, KERB_Z);
    parts.push(g);
  }
  return merge(parts);
}

/** Ce qui est peint en noir : l'autre tronçon de lisse sur deux, et le fond. */
function buildCrossingDark(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 1; i < BOOM_PARTS; i += 2) {
    parts.push(boxAt(0.1, 0.15, BOOM_LEN, BOOM_X, BOOM_Y, boomZ(i)));
  }
  // Panneau de fond des feux : c'est lui qui les rend lisibles en plein soleil.
  parts.push(boxAt(0.08, 0.44, 1.05, SIGNAL_X - 0.06, 2.28, KERB_Z));
  return merge(parts);
}

/**
 * La chaussée : deux alignements droits, et la rampe qui descend au rail.
 *
 * Vingt centimètres à racheter sur un mètre soixante, soit sept degrés. C'est
 * exactement ce qui se passe sur place - une rue de Tokyo arrive au passage à
 * niveau par une contre-pente courte, et c'est même ce qui la fait ralentir.
 */
function buildCrossingRoad(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const dx = RAMP_OUT - DECK_HALF;
  const dy = ROAD_Y - DECK_Y;
  const straight = ROAD_HALF - RAMP_OUT;
  for (const side of [1, -1]) {
    parts.push(
      boxAt(straight, ROAD_T, ROAD_W, side * (RAMP_OUT + straight / 2), ROAD_Y - ROAD_T / 2, 0),
    );
    // La rampe est une boîte INCLINÉE : on la tourne à l'origine, puis on la
    // pose. Traduite d'abord, elle tournerait autour de l'axe de la voie.
    const slope = new THREE.BoxGeometry(Math.hypot(dx, dy), ROAD_T, ROAD_W);
    slope.rotateZ(side * Math.atan2(dy, dx));
    slope.translate(side * (DECK_HALF + dx / 2), DECK_Y + dy / 2 - ROAD_T / 2, 0);
    parts.push(slope);
  }
  return merge(parts);
}

/** Le platelage, et les deux rails qui le traversent. */
function buildCrossingDeck(): THREE.BufferGeometry {
  return boxAt(DECK_HALF * 2, ROAD_T, ROAD_W + 0.4, 0, DECK_Y - ROAD_T / 2, 0);
}

/**
 * Les rails, par-dessus le platelage.
 *
 * Sans eux la voie s'interrompait sur sept mètres : le platelage recouvre la
 * plate-forme, qui est un plan texturé où les rails sont PEINTS. Ils reviennent
 * donc ici en relief, trois centimètres au-dessus de la dalle, avec l'ornière
 * que la dalle laisse de chaque côté - c'est ce détail-là qui dit qu'on
 * franchit une voie ferrée et non un caniveau.
 */
function buildCrossingRails(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    parts.push(boxAt(0.075, 0.07, ROAD_W + 0.6, side * GAUGE_X, DECK_Y, 0));
  }
  return merge(parts);
}

// --- L'autoroute urbaine ----------------------------------------------------

/** Une travée : dalle, deux parapets, et la chevêtre qui repose sur les piles. */
function buildDeck(): THREE.BufferGeometry {
  const x0 = PIER_IN - 1.1;
  const x1 = PIER_OUT + 1.7;
  const w = x1 - x0;
  const mid = (x0 + x1) / 2;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(boxAt(w, 1.4, SEC, mid, 0.7, 0));
  for (const x of [x0 + 0.21, x1 - 0.21]) parts.push(boxAt(0.42, 1.0, SEC, x, 1.9, 0));
  // Chevêtre au joint de travée : elle porte, et elle donne au tablier le
  // rythme qu'on lit en passant dessous.
  parts.push(boxAt(w * 0.96, 0.95, 2.4, mid, -0.48, -SEC / 2 + 1.2));
  // Candélabres du parapet intérieur. Ils ont d'abord été posés SUR le parapet,
  // ce qui revenait à ne pas les poser du tout : la rame passe sous le tablier,
  // et un foyer derrière un parapet ne se voit pas de dessous. Sur leur fût, ils
  // dépassent du bord et se découpent sur le ciel - c'est de là qu'on sait, la
  // nuit, qu'il y a une route au-dessus.
  for (const z of [-SEC / 4, SEC / 4]) {
    parts.push(boxAt(0.13, LAMP_MAST, 0.13, LAMP_X, 2.4 + LAMP_MAST / 2, z));
  }
  return merge(parts);
}

/** Fût et abscisse des candélabres du tablier (m). */
const LAMP_MAST = 1.5;
const LAMP_X = PIER_IN - 0.62;

/** Les deux foyers d'une travée : la lentille, en tête de fût. */
function buildDeckLamps(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-SEC / 4, SEC / 4]) {
    parts.push(boxAt(0.52, 0.14, 0.26, LAMP_X - 0.16, 2.4 + LAMP_MAST, z));
  }
  return merge(parts);
}

/** Nombre de travées portées par palier : rien de neuf aux deux plus bas. */
function tuning(quality: Quality): number {
  const level = qualityLevel(quality);
  if (quality === 'extraordinary' || level <= 2) return SEC_COUNT;
  if (level === 3) return 8;
  return 0;
}

export function Singularities() {
  const quality = usePerf((s) => s.quality);
  const sections = tuning(quality);

  const built = useMemo(() => {
    // Chaussée et béton : deux matériaux éclairés, pour que le tablier porte
    // une vraie ombre et que l'eau accroche le soleil.
    const asphalt = new THREE.MeshStandardMaterial({ color: '#4a4a4d', roughness: 0.92 });
    const concrete = new THREE.MeshStandardMaterial({ color: '#b3b0a8', roughness: 0.85 });
    concrete.userData.base = concrete.color.clone();
    const steel = new THREE.MeshStandardMaterial({
      color: '#9d9c98',
      roughness: 0.6,
      metalness: 0.3,
    });
    const warn = new THREE.MeshStandardMaterial({ color: '#e5c33a', roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: '#232326', roughness: 0.75 });
    // Le platelage du passage à niveau : du béton de dalle usé par les roues,
    // plus sombre qu'un tablier neuf. Au gris de tablier, il devenait la surface
    // la plus claire du cadre - et un platelage n'est pas ce qu'on regarde.
    const slab = new THREE.MeshStandardMaterial({ color: '#8b8984', roughness: 0.92 });
    slab.userData.base = slab.color.clone();
    // L'eau. Elle a d'abord été faite métallique et sombre, ce qui semblait
    // juste et ne l'était pas : sans carte d'environnement, un métal lisse ne
    // réfléchit que le soleil et reste noir partout ailleurs - le chenal lisait
    // comme une chaussée. Ce qui fait qu'on reconnaît de l'eau vue d'en haut,
    // c'est qu'elle est PLUS CLAIRE que ses berges, parce qu'elle rend le ciel.
    // Elle est donc diélectrique, à peine rugueuse, et sa teinte se relève du
    // ciel du moment chaque image.
    // La teinte de fond est BASSE et ce n'est pas une erreur : la nappe reçoit le
    // soleil, le ciel de l'hémisphérique et l'ambiante, soit deux fois et demie
    // ce que sa couleur annonce. Réglée à l'œil sur ce qu'on voudrait voir, l'eau
    // ressortait plus claire que ses propres murs de berge.
    const waterTex = makeWaterTexture();
    waterTex.repeat.set(RIVER_HALF * 2 / 26, 1);
    const water = new THREE.MeshStandardMaterial({
      map: waterTex,
      color: '#7c8f99',
      roughness: 0.34,
      metalness: 0.1,
    });
    water.userData.base = water.color.clone();
    // Le béton des berges, plus sourd que celui d'un tablier d'autoroute : c'est
    // du vieux mur de canal, et c'est SON contraste avec la nappe qui fait lire
    // le chenal. Les deux au même gris, on ne voyait qu'une dalle.
    const bank = new THREE.MeshStandardMaterial({ color: '#9b988f', roughness: 0.9 });
    bank.userData.base = bank.color.clone();
    // Feux battants et foyers d'autoroute : hors correction de tons, jamais
    // éclairés - ce sont des sources.
    const lampA = new THREE.MeshBasicMaterial({ color: '#ff2a1e', toneMapped: false, fog: true });
    const lampB = new THREE.MeshBasicMaterial({ color: '#ff2a1e', toneMapped: false, fog: true });
    const deckLamp = new THREE.MeshBasicMaterial({
      color: '#ffd9a0',
      toneMapped: false,
      fog: true,
    });

    const mkInstanced = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      count: number,
      family: string,
    ) => {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // La visibilité est pilotée à la main (le groupe entier s'efface hors du
      // tronçon concerné) : le tri par frustum n'aurait que la sphère de la
      // géométrie à se mettre sous la dent, et elle ne veut rien dire ici.
      mesh.frustumCulled = false;
      mesh.userData.cityFamily = family;
      mesh.userData.noShadow = true;
      return mesh;
    };

    // --- Passage à niveau ---
    // La chaussée passe par-dessus la dalle de rue du générateur (14 cm), sinon
    // les deux se disputent le tampon de profondeur au droit de la trouée - puis
    // elle redescend au rail, où c'est le platelage qui prend le relais.
    const roadGeo = buildCrossingRoad();
    const panelGeo = buildCrossingDeck();
    const railGeo = buildCrossingRails();
    const steelGeo = buildCrossingSteel();
    const warnGeo = buildCrossingWarn();
    const darkGeo = buildCrossingDark();
    // Les deux feux.
    //
    // Ils ont d'abord été faits en disques tournés vers la chaussée - ce que
    // sont les vrais, un 警報機 avertit la route et pas le train - et on ne les
    // voyait donc pas : depuis la voie, un disque se présente par la tranche.
    // Ce sont maintenant des calottes, qui se lisent de tous les côtés comme se
    // lit une lentille bombée sous son visière ; l'écran noir derrière elles
    // continue de dire de quel côté regarde le feu.
    const bulb = (dz: number) => {
      const g = new THREE.SphereGeometry(0.19, 8, 5);
      g.translate(SIGNAL_X + 0.1, 2.28, KERB_Z + dz);
      return g;
    };
    const bulbA = bulb(0.3);
    const bulbB = bulb(-0.3);

    const road = new THREE.Mesh(roadGeo, asphalt);
    const panel = new THREE.Mesh(panelGeo, slab);
    const rails = new THREE.Mesh(railGeo, steel);
    for (const m of [road, panel, rails]) {
      m.frustumCulled = false;
      m.receiveShadow = false;
      m.castShadow = false;
    }
    const gear = mkInstanced(steelGeo, steel, 2, 'passage à niveau');
    const gearWarn = mkInstanced(warnGeo, warn, 2, 'lisse jaune');
    const gearDark = mkInstanced(darkGeo, dark, 2, 'lisse noire');
    const flashA = mkInstanced(bulbA, lampA, 2, 'feu battant A');
    const flashB = mkInstanced(bulbB, lampB, 2, 'feu battant B');

    // --- Rivière ---
    const waterGeo = new THREE.PlaneGeometry(RIVER_HALF * 2, WATER_W);
    waterGeo.rotateX(-Math.PI / 2);
    waterGeo.translate(0, WATER_Y, 0);
    const waterMesh = new THREE.Mesh(waterGeo, water);
    waterMesh.frustumCulled = false;
    // Mur de berge : le voile, sa margelle, et la lisse de garde-corps qu'on
    // voit toujours au-dessus d'une rivière canalisée.
    const bankGeo = merge([
      boxAt(RIVER_HALF * 2, BANK_H, 0.8, 0, BANK_H / 2, 0),
      boxAt(RIVER_HALF * 2, 0.22, 1.5, 0, BANK_H + 0.11, 0.1),
      boxAt(RIVER_HALF * 2, 0.09, 0.09, 0, BANK_H + 1.0, 0.62),
      boxAt(RIVER_HALF * 2, 0.09, 0.09, 0, BANK_H + 0.62, 0.62),
    ]);
    const banks = mkInstanced(bankGeo, bank, 2, 'berge');

    // --- Autoroute urbaine ---
    const deckGeo = buildDeck();
    const pierGeo = cylAt(0.72, 0.86, 1, 10, 0, 0.5, 0);
    const lampGeo = buildDeckLamps();
    const count = Math.max(1, sections);
    const deck = mkInstanced(deckGeo, concrete, count, 'tablier');
    const piers = mkInstanced(pierGeo, concrete, count * 2, 'piles');
    const lamps = mkInstanced(lampGeo, deckLamp, count, 'foyers du tablier');

    return {
      mats: [asphalt, concrete, slab, bank, steel, warn, dark, water, lampA, lampB, deckLamp],
      texs: [waterTex],
      geos: [
        roadGeo,
        panelGeo,
        railGeo,
        steelGeo,
        warnGeo,
        darkGeo,
        bulbA,
        bulbB,
        waterGeo,
        bankGeo,
        deckGeo,
        pierGeo,
        lampGeo,
      ],
      toned: [concrete, slab, bank],
      water,
      lampA,
      lampB,
      deckLamp,
      road,
      panel,
      rails,
      gear,
      gearWarn,
      gearDark,
      flashA,
      flashB,
      waterMesh,
      banks,
      deck,
      piers,
      lamps,
    };
  }, [sections]);

  useEffect(
    () => () => {
      for (const m of [
        built.gear,
        built.gearWarn,
        built.gearDark,
        built.flashA,
        built.flashB,
        built.banks,
        built.deck,
        built.piers,
        built.lamps,
      ]) {
        m.dispose();
      }
      for (const g of built.geos) g.dispose();
      for (const m of built.mats) m.dispose();
      for (const t of built.texs) t.dispose();
    },
    [built],
  );

  const crossRoot = useRef<THREE.Group>(null);
  const riverRoot = useRef<THREE.Group>(null);
  const roadRoot = useRef<THREE.Group>(null);

  const scratch = useMemo(
    () => ({
      mtx: new THREE.Matrix4(),
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
      pos: new THREE.Vector3(),
      scl: new THREE.Vector3(1, 1, 1),
      rot: new THREE.Quaternion(),
      axis: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  useFrame((state) => {
    if (!sections) return;
    const sc = scratch;
    const w = dayNightWeights(runtime.clockMin / 60);
    const night = Math.min(1, w.night + w.golden * 0.45);
    const nightK = 1 - 0.5 * night;
    // Le béton d'un ouvrage prend la lumière du jour comme les murs de tronçon :
    // même loi, sinon un tablier reste blanc à minuit au-dessus d'une ville
    // éteinte. Tablier, platelage et murs de berge suivent la même.
    const dim = nightK * (1 - 0.22 * weather.wet);
    for (const m of built.toned) {
      m.color.copy(m.userData.base as THREE.Color).multiplyScalar(dim);
    }
    // L'eau, elle, ne s'éteint pas : elle prend la couleur du ciel. La brume de
    // la scène EST cette couleur - c'est le même ciel diffusé qui teinte le
    // lointain (three/Scene) - et la reprendre ici donne gratuitement l'accord
    // qu'on cherchait : bleue par temps clair, plombée sous l'averse, mauve à la
    // nuit tombée. La nuit, c'est la ville qu'elle renvoie, et une rivière de
    // Tokyo à minuit est plus claire que ses berges.
    const sky = state.scene.fog instanceof THREE.Fog ? state.scene.fog.color : null;
    built.water.color
      .copy(built.water.userData.base as THREE.Color)
      .multiplyScalar(1 - 0.4 * night);
    if (sky) built.water.color.lerp(sky, 0.07);
    built.water.emissive.setRGB(0.07, 0.055, 0.04).multiplyScalar(night);

    // --- Passage à niveau et rivière : ponctuels, posés sur une rue ---
    //
    // Rien de tout cela sur le prototype PLATEAU, pour la même raison que le
    // tablier plus bas : la ville y est relevée sur le terrain, et une rivière
    // procédurale couperait une rue réelle.
    const kind = plateauRuntime.coverage < 0.5 ? singularity.kind : null;
    const z = runtime.distance - singularity.s;
    const near = kind !== null && Math.abs(z) < 340;

    if (crossRoot.current) {
      const on = near && kind === 'crossing';
      crossRoot.current.visible = on;
      if (on) {
        crossRoot.current.position.set(0, segEnv.cityY, z);
        crossRoot.current.rotation.y = -singularity.yaw;
        // Les feux battent : deux temps par seconde, en opposition. C'est le
        // seul mouvement de tout le décor qui ne vienne pas de la vitesse du
        // train, et c'est à ça qu'on reconnaît un passage à niveau de loin.
        const beat = ((runtime.clockMin * 60) % 1) < 0.5;
        const lit = 0.55 + 1.45 * night;
        built.lampA.color.setRGB(1, 0.16, 0.11).multiplyScalar(beat ? lit : lit * 0.14);
        built.lampB.color.setRGB(1, 0.16, 0.11).multiplyScalar(beat ? lit * 0.14 : lit);
        // Deux ensembles, en vis-à-vis : chacun barre son sens de circulation,
        // planté du côté droit de sa chaussée comme le veut la règle.
        for (let i = 0; i < 2; i++) {
          sc.pos.set(0, ROAD_Y, 0);
          sc.rot.setFromAxisAngle(sc.axis, i === 0 ? 0 : Math.PI);
          sc.scl.set(1, 1, 1);
          sc.mtx.compose(sc.pos, sc.rot, sc.scl);
          for (const m of [built.gear, built.gearWarn, built.gearDark, built.flashA, built.flashB]) {
            m.setMatrixAt(i, sc.mtx);
          }
        }
        for (const m of [built.gear, built.gearWarn, built.gearDark, built.flashA, built.flashB]) {
          m.instanceMatrix.needsUpdate = true;
        }
      }
    }

    if (riverRoot.current) {
      const on = near && kind === 'river';
      riverRoot.current.visible = on;
      if (on) {
        // L'eau coule au fond d'un chenal dont les murs montent AU-DESSUS de la
        // rue. C'est le parti de toutes les rivières canalisées de Tokyo, et
        // c'est aussi ce qui la rend visible depuis un viaduc : la nappe est
        // posée sur le sol urbain, ce sont les murs qui creusent.
        riverRoot.current.position.set(0, segEnv.cityY, z);
        riverRoot.current.rotation.y = -singularity.yaw;
        for (let i = 0; i < 2; i++) {
          sc.pos.set(0, 0, (i === 0 ? 1 : -1) * (WATER_W / 2 + 0.4));
          sc.rot.setFromAxisAngle(sc.axis, i === 0 ? 0 : Math.PI);
          sc.scl.set(1, 1, 1);
          sc.mtx.compose(sc.pos, sc.rot, sc.scl);
          built.banks.setMatrixAt(i, sc.mtx);
        }
        built.banks.instanceMatrix.needsUpdate = true;
      }
    }

    // --- Autoroute urbaine : les travées, recyclées sur l'abscisse monde ---
    if (roadRoot.current) {
      // Le prototype PLATEAU pose une ville relevée sur le terrain : un tablier
      // procédural s'y planterait dans un immeuble réel.
      const on = expressway.on && plateauRuntime.coverage < 0.5;
      roadRoot.current.visible = on;
      if (on) {
        const side = expressway.side;
        const push = side * (sidePush(side) + segEnv.citySetback);
        const under = segEnv.cityY + DECK_CLEAR;
        const lit = night > 0.06;
        built.lamps.visible = lit;
        built.deckLamp.color.setRGB(1, 0.85, 0.63).multiplyScalar(0.3 + 1.5 * night);
        // Le tablier est du côté +x de sa géométrie : le côté −x s'obtient par
        // un demi-tour, qui retourne aussi la travée sur elle-même - elle est
        // symétrique, ça ne se voit pas.
        const flip = side === 1 ? 0 : Math.PI;
        // Grille MONDE : les travées tombent toujours sur les mêmes abscisses,
        // et le tablier n'a donc aucun joint qui glisse au recyclage.
        const base = Math.floor((runtime.distance - (sections * SEC) / 2) / SEC) * SEC;
        for (let i = 0; i < sections; i++) {
          const s = base + i * SEC;
          const dz = runtime.distance - s;
          // Le tablier s'arrête à soixante mètres des gares : ses deux
          // extrémités tombent derrière les structures de quai.
          const inside = s > expressway.s0 && s < expressway.s1;
          if (!inside || hiddenByStation(dz)) {
            built.deck.setMatrixAt(i, sc.hidden);
            built.lamps.setMatrixAt(i, sc.hidden);
            built.piers.setMatrixAt(i * 2, sc.hidden);
            built.piers.setMatrixAt(i * 2 + 1, sc.hidden);
            continue;
          }
          sc.pos.set(push, under, dz);
          sc.rot.setFromAxisAngle(sc.axis, flip);
          sc.scl.set(1, 1, 1);
          sc.mtx.compose(sc.pos, sc.rot, sc.scl);
          built.deck.setMatrixAt(i, sc.mtx);
          built.lamps.setMatrixAt(i, sc.mtx);
          // Deux piles par joint de travée, sous la chevêtre. Elles montent du
          // sol de la ville jusque sous le tablier : leur hauteur suit donc le
          // type de tronçon, sept mètres plus bas sur un viaduc.
          const h = Math.max(1, DECK_CLEAR - 0.95);
          for (let k = 0; k < 2; k++) {
            sc.pos.set(side * (k === 0 ? PIER_IN : PIER_OUT) + push, segEnv.cityY, dz - SEC / 2 + 1.2);
            sc.rot.identity();
            sc.scl.set(1, h, 1);
            sc.mtx.compose(sc.pos, sc.rot, sc.scl);
            built.piers.setMatrixAt(i * 2 + k, sc.mtx);
          }
        }
        built.deck.instanceMatrix.needsUpdate = true;
        built.piers.instanceMatrix.needsUpdate = true;
        built.lamps.instanceMatrix.needsUpdate = true;
      }
    }
  });

  if (!sections) return null;
  return (
    <>
      <group ref={crossRoot} visible={false}>
        <primitive object={built.road} />
        <primitive object={built.panel} />
        <primitive object={built.rails} />
        <primitive object={built.gear} />
        <primitive object={built.gearWarn} />
        <primitive object={built.gearDark} />
        <primitive object={built.flashA} />
        <primitive object={built.flashB} />
      </group>

      <group ref={riverRoot} visible={false}>
        <primitive object={built.waterMesh} />
        <primitive object={built.banks} />
      </group>

      <group ref={roadRoot} visible={false}>
        <primitive object={built.deck} />
        <primitive object={built.piers} />
        <primitive object={built.lamps} />
      </group>
    </>
  );
}
