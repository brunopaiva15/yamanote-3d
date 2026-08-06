// Le relief lointain : le Tanzawa, l'Okutama, le Chichibu, les collines de Bōsō.
//
// La bible réclame une bande de vingt à cinquante kilomètres, et le décor n'en
// avait aucune : au-delà des repères ponctuels de three/city/FarSkyline, il n'y
// avait que du ciel. Or c'est faux dans un sens ET dans l'autre. Faux parce que
// par un matin d'hiver, l'ouest de Tokyo est barré d'une ligne de montagnes
// bleues qu'on voit d'un quai de Shinjuku. Faux aussi parce qu'un ciel vide
// laisse croire que la plaine est infinie, alors qu'elle bute à cinquante
// kilomètres sur un mur de mille cinq cents mètres.
//
// Les sommets viennent du modèle numérique de terrain du 国土地理院
// (data/relief), pas d'une carte dessinée à la main : ce sont des maxima
// locaux du relevé, nommés par recoupement avec OSM quand un sommet nommé est à
// moins de deux kilomètres. Rien n'est inventé, et ce qui n'a pas de nom
// n'en reçoit pas.
//
// --- CE QUI SE VOIT VRAIMENT, ET C'EST PEU ---
//
// Le calcul est dans three/city/reliefProfile, et sa conclusion mérite d'être
// écrite ici : la plupart de ces collines sont INVISIBLES. La Terre se bombe de
// cent mètres en quarante kilomètres, si bien que les collines de Tama, de
// Sayama et de Miura - cent à deux cents mètres - sont sous l'horizon d'un
// voyageur assis. Ce qui dépasse est ce qui est assez haut ou assez près :
// l'Ōyama, le Tanzawa, l'Okutama, le Chichibu à l'ouest et au nord-ouest ;
// presque rien à l'est, où il n'y a que la mer et la plaine du Kantō. Le Fuji
// n'est pas ici : il est dans three/city/FarSkyline avec sa neige, et à
// quatre-vingt-quatorze kilomètres il est hors de la bande de la bible - la
// bible le dit, on le respecte.
//
// --- LE RENDU : UN ANNEAU, ET UNE SEULE PASSE ---
//
// Un maillage par sommet serait absurde - deux cents découpes pour dessiner une
// ligne. On dessine donc la LIGNE DE CRÊTE elle-même : un anneau de quadrilatères
// autour de l'œil, un par secteur d'azimut, dont le sommet suit le profil.
// L'anneau est bâti en azimut VRAI et tourné du cap du train à chaque image,
// ce qui le rend géographiquement fixe pour trois lignes de code : les
// montagnes ne bougent pas quand on tourne autour, c'est même leur définition.
//
// L'idiome de rendu est celui de three/city/FarSkyline - matériau opaque, test
// de profondeur désactivé, `renderOrder` entre le ciel et le décor - avec un
// rang choisi pour passer DEVANT le Fuji et DERRIÈRE tout le reste : à
// quatre-vingt-quatorze kilomètres, le Fuji est bien derrière le Tanzawa, et
// c'est exactement ce qu'on voit depuis Tokyo.
//
// Une réserve, et elle est honnête : la silhouette peinte du ciel (~890 m) est
// composée dans la passe du ciel, donc AVANT celle-ci, et le relief la
// recouvre là où ils se croisent. C'est le même compromis que les repères de
// FarSkyline depuis la troisième passe, et il se voit d'autant moins ici que le
// relief est noyé de brume à cinquante kilomètres. Ce qui compte est que le
// ruban urbain, lui, est de la vraie géométrie qui écrit la profondeur : les
// immeubles du premier plan masquent le relief pour de bon.

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../../systems/runtime';
import { dayNightWeights } from '../../systems/daynight';
import { useStore } from '../../store';
import { CONFIG } from '../../data/config';
import { journeyProgress } from '../../data/segments';
import { GEO_LANDMARKS } from '../../data/tokyoGeo';
import { RELIEF_SUMMITS, type ReliefSummit } from '../../data/relief';
import { loopPose, makePose } from '../../systems/tokyoBearing';
import { segEnv } from '../../systems/segmentEnv';
import { trackElevation } from '../../systems/terrain';
import { qualityLevel, usePerf, type Quality } from '../../systems/perf';
import { airRange, veilAt, veilCutoff, VEIL_MAX } from './airDepth';
import { buildProfile, horizonDip, makeProfile } from './reliefProfile';

/** Rayon de la sphère de pose (m de scène) : celui de three/city/FarSkyline. */
const RS = 96;

/**
 * Rang de rendu.
 *
 * FarSkyline échelonne ses repères de −900 (le plus proche) à −939 (le plus
 * lointain, c'est-à-dire le Fuji à quatre-vingt-quatorze kilomètres). Le relief
 * se glisse juste au-dessus du Fuji et sous tout le reste : la tour Landmark de
 * Yokohama, à vingt-cinq kilomètres, passe donc devant les crêtes du Tanzawa
 * qui sont deux fois plus loin, et le Fuji passe derrière. Les deux sont vrais.
 */
const RENDER_ORDER = -935;

/**
 * Ton du relief : le bleu de l'éloignement.
 *
 * Une montagne lointaine n'est pas verte. Ce qu'on en reçoit est surtout de la
 * lumière du ciel diffusée par les quarante kilomètres d'air qui la séparent de
 * l'œil, et c'est pour cela qu'un peintre chinois peignait ses montagnes en
 * bleu. Le ton de départ est déjà froid ; la brume finit le travail.
 */
const TONE = new THREE.Color('#6f829d');

/** Le fond dans lequel le relief se noie la nuit (cf. FarSkyline). */
const NIGHT_HAZE = new THREE.Color('#4d3b34');

/**
 * Un sommet déjà tenu par un repère de FarSkyline ne se dessine pas deux fois.
 *
 * En pratique il n'y en a qu'un, le Fuji, et il vaut mieux que ce soit celui de
 * FarSkyline : il y a sa calotte de neige, qui va et vient avec la saison, et
 * son profil concave de stratovolcan que la lorentzienne du profil de crête ne
 * sait pas rendre.
 */
const MOUNTAIN_LANDMARKS = GEO_LANDMARKS.filter((lm) => lm.shape === 'mountain');

function alreadyDrawn(su: ReliefSummit): boolean {
  for (const lm of MOUNTAIN_LANDMARKS) {
    if (Math.hypot(su.x - lm.x, su.z - lm.z) < 4000) return true;
  }
  return false;
}

const SUMMITS = RELIEF_SUMMITS.filter((su) => !alreadyDrawn(su));

/**
 * Finesse du tour d'horizon, par palier.
 *
 * Un secteur de trois cent quatre-vingt-quatre vaut un degré : la crête du
 * Tanzawa, qui occupe une quinzaine de degrés, y tient sur quinze marches, ce
 * qui suffit largement pour une ligne haute d'un degré. Aux deux derniers
 * paliers, rien de neuf - c'est la règle des passes précédentes.
 */
function tuning(quality: Quality): number {
  const level = qualityLevel(quality);
  if (quality === 'extraordinary' || level <= 1) return 512;
  if (level === 2) return 384;
  if (level === 3) return 256;
  return 0;
}

/** Mètres parcourus avant de refaire le profil. */
const REBUILD_METERS = 80;
/** Variation d'altitude de l'œil qui justifie de le refaire (m). */
const REBUILD_RISE = 1.5;

export function FarRelief() {
  const scene = useThree((s) => s.scene);
  const quality = usePerf((s) => s.quality);
  const bins = tuning(quality);

  const built = useMemo(() => {
    if (!bins) return null;
    const profile = makeProfile(bins);
    // Deux sommets par secteur - la crête et son pied -, et les quadrilatères
    // se referment sur le secteur zéro : un anneau n'a pas de couture.
    const pos = new Float32Array(bins * 2 * 3);
    const col = new Float32Array(bins * 2 * 3);
    const idx = new Uint16Array(bins * 6);
    for (let i = 0; i < bins; i++) {
      const j = (i + 1) % bins;
      idx.set([i * 2 + 1, j * 2 + 1, j * 2, i * 2 + 1, j * 2, i * 2], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      fog: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'relief lointain';
    mesh.renderOrder = RENDER_ORDER;
    // L'anneau est centré sur l'œil et fait tout le tour : le tronconnage de
    // frustum ne peut jamais l'écarter, et la boîte englobante qu'il faudrait
    // recalculer à chaque profil coûterait plus que les mille triangles
    // qu'elle prétend économiser.
    mesh.frustumCulled = false;
    return { profile, geo, mat, mesh, pos, col };
  }, [bins]);

  useEffect(() => {
    if (!built) return;
    return () => {
      built.geo.dispose();
      built.mat.dispose();
    };
  }, [built]);

  const scratch = useMemo(
    () => ({
      pose: makePose(),
      haze: new THREE.Color('#d6e8f2'),
      tone: new THREE.Color(),
      col: new THREE.Color(),
      /** Où l'on a bâti le profil courant, pour savoir quand le refaire. */
      atX: NaN,
      atZ: NaN,
      atAlt: NaN,
      atRange: NaN,
    }),
    [],
  );

  useFrame(() => {
    if (!built) return;
    const sc = scratch;
    const { index, phase, loopDirection } = useStore.getState();
    const p = journeyProgress(phase, runtime.phaseT, index, loopDirection);
    loopPose(index, p, loopDirection, sc.pose);

    // L'altitude de l'œil, et elle compte : c'est elle qui décide de ce qui
    // dépasse. `trackElevation` donne la cote du sol sous la voie (MNT du
    // 国土地理院), `segEnv.cityY` dit de combien la voie court au-dessus de ce
    // sol - sept mètres et demi sur les tronçons en viaduc -, et le regard est
    // encore au-dessus. Un train sur viaduc à Shinjuku voit son horizon quatre
    // kilomètres plus loin qu'un train au sol à Yūrakuchō.
    const eyeAlt = trackElevation() + CONFIG.eyeHeight - segEnv.cityY;
    const range = airRange();
    const moved = Math.hypot(sc.pose.x - sc.atX, sc.pose.z - sc.atZ);
    const stale =
      !(moved < REBUILD_METERS) ||
      !(Math.abs(eyeAlt - sc.atAlt) < REBUILD_RISE) ||
      !(Math.abs(Math.log(range / sc.atRange)) < 0.05);

    if (stale) {
      buildProfile(built.profile, SUMMITS, sc.pose.x, sc.pose.z, eyeAlt, veilCutoff(range));
      sc.atX = sc.pose.x;
      sc.atZ = sc.pose.z;
      sc.atAlt = eyeAlt;
      sc.atRange = range;
      writeRing(built.pos, built.profile.elev, eyeAlt);
      built.geo.attributes.position.needsUpdate = true;
    }

    // Le cap : l'anneau est bâti en azimut vrai, on le tourne du cap du train.
    // Une rotation d'angle θ autour de +y envoie l'azimut a sur a − θ, donc
    // c'est bien le cap lui-même qu'il faut, et non son opposé.
    built.mesh.rotation.y = sc.pose.bearing;

    const w = dayNightWeights(runtime.clockMin / 60);
    const night = Math.min(1, w.night + w.golden * 0.4);
    if (scene.fog instanceof THREE.Fog) sc.haze.copy(scene.fog.color);
    sc.haze.lerp(NIGHT_HAZE, 0.85 * night);
    // La nuit, une montagne n'est plus qu'une découpe noire sur la lueur de la
    // ville - davantage qu'un immeuble, qui garde ses fenêtres allumées.
    sc.tone.copy(TONE).multiplyScalar(1 - 0.72 * night);

    let seen = false;
    const { elev, dist } = built.profile;
    for (let i = 0; i < elev.length; i++) {
      if (elev[i] > 0) seen = true;
      const veil = Math.min(VEIL_MAX, veilAt(dist[i], range));
      sc.col.copy(sc.tone).lerp(sc.haze, veil);
      built.col[i * 6] = sc.col.r;
      built.col[i * 6 + 1] = sc.col.g;
      built.col[i * 6 + 2] = sc.col.b;
      // Le pied d'une crête est plus noyé que sa ligne de faîte : on regarde
      // au ras du sol, à travers la couche d'air la plus chargée. C'est ce
      // dégradé-là qui fait lire « loin » plutôt que « découpe de carton ».
      sc.col.copy(sc.tone).lerp(sc.haze, Math.min(VEIL_MAX, veil + 0.12 * (1 - veil)));
      built.col[i * 6 + 3] = sc.col.r;
      built.col[i * 6 + 4] = sc.col.g;
      built.col[i * 6 + 5] = sc.col.b;
    }
    built.geo.attributes.color.needsUpdate = true;
    built.mesh.visible = seen;
  });

  if (!built) return null;
  // Comme FarSkyline, le groupe est posé À HAUTEUR D'ŒIL : c'est de là que part
  // l'horizon, et le pied des crêtes s'y appuie.
  return (
    <group position={[0, CONFIG.eyeHeight, 0]}>
      <primitive object={built.mesh} />
    </group>
  );
}

/**
 * Le profil, posé sur la sphère.
 *
 * Le pied de toutes les crêtes est sur l'HORIZON VRAI, qui n'est pas à hauteur
 * des yeux mais un peu en dessous - deux dixièmes de degré depuis un viaduc.
 * Les secteurs où rien ne dépasse gardent une épaisseur nulle : sans cela, un
 * mince liséré de montagne ferait tout le tour, y compris au large de la baie
 * où il n'y a rien.
 */
function writeRing(pos: Float32Array, elev: Float32Array, eyeAlt: number): void {
  const bins = elev.length;
  const foot = -horizonDip(eyeAlt);
  const yFoot = RS * Math.sin(foot);
  const rFoot = RS * Math.cos(foot);
  for (let i = 0; i < bins; i++) {
    const a = (i / bins) * 2 * Math.PI;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const e = foot + Math.max(0, elev[i]);
    const rTop = RS * Math.cos(e);
    pos[i * 6] = rTop * sin;
    pos[i * 6 + 1] = RS * Math.sin(e);
    pos[i * 6 + 2] = -rTop * cos;
    pos[i * 6 + 3] = rFoot * sin;
    pos[i * 6 + 4] = yFoot;
    pos[i * 6 + 5] = -rFoot * cos;
  }
}
