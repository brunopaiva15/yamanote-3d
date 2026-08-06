// La circulation des rues perpendiculaires.
//
// Une rue vide est une rue de maquette. Ce qui manquait au ruban urbain n'est
// pas du détail - il en a - mais du MOUVEMENT INDÉPENDANT : tant que tout ce
// qui bouge dans le champ bouge à la même vitesse (celle du train, en sens
// inverse), le cerveau lit une image qui défile. Une camionnette qui traverse
// une trouée dans son propre sens casse cette lecture pour trois boîtes.
//
// Une rue n'est visible que deux secondes à quatre-vingt-dix kilomètres à
// l'heure, et jamais au-delà de cent cinquante mètres : c'est ce qui autorise
// une flotte de vingt véhicules pour toute la ligne, recomposée à chaque image
// à partir des seules rues en vue.
//
// Deux familles de silhouettes - la voiture et le petit utilitaire, qui font
// l'essentiel d'une rue de desserte japonaise -, quatre appels de rendu en
// tout, dont deux (les feux) n'existent pas de jour. Les teintes de caisse
// sortent d'une palette JAPONAISE : blanc, argent, gris, noir. La couleur y est
// l'exception, pas la règle - c'est ce qui donne à une rue de Tokyo son air
// métallique.
//
// Les COULEURS DE SOMMET portent ce que la teinte d'instance ne peut pas dire :
// vitrage sombre, bas de caisse et roues noirs. Three multiplie l'une par
// l'autre, si bien qu'une seule géométrie et un seul matériau donnent une
// caisse teintée par instance ET un vitrage qui reste sombre.
//
// Ce fichier ne fait que DESSINER. Où se tient un véhicule et dans quel sens il
// roule est affaire de repère, pas de dessin, et vit dans systems/trafficLane -
// où un test le vérifie contre la dalle de rue du générateur.

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runtime } from '../../systems/runtime';
import { dayNightWeights } from '../../systems/daynight';
import { segEnv } from '../../systems/segmentEnv';
import { plateauRuntime } from '../../systems/plateau';
import { hiddenByStation, sidePush } from '../../systems/stationOcclusion';
import { qualityLevel, usePerf, type Quality } from '../../systems/perf';
import { CELL_LEN } from '../../systems/cityField';
import { laneSlot, makeLane } from '../../systems/trafficLane';
import { inSingularity } from '../../systems/singularity';

/** Cote de la chaussée : le dessus de la dalle de rue de `buildCellProps`. */
const ROAD_TOP = 0.14;

/** Fenêtre de travail : au-delà, une voiture fait deux pixels. */
const BEHIND = 45;

/** Capacité des maillages. Au-delà, les rues les plus lointaines se taisent. */
const CAR_CAP = 18;
const VAN_CAP = 10;
// Les feux comptent moins loin que les caisses : à cent cinquante mètres, une
// paire de phares est un pixel, et c'est le premier poste qu'on rogne.
const LIGHT_CAP = 16;

/** Teintes de caisse : la palette d'un parking japonais, dans ses proportions. */
const PAINT = [
  '#eef0f1',
  '#e6e8ea',
  '#c3c7cc',
  '#a8adb3',
  '#8d9299',
  '#2a2d31',
  '#1c1f23',
  '#4e5a68',
  '#6d3a3c',
];
/** Un utilitaire de livraison est blanc, et c'est presque une loi. */
const VAN_PAINT = ['#f0f1f2', '#e8e9ea', '#dcdee0', '#cfd2d5', '#9aa0a6'];

const GLASS = new THREE.Color('#20242a');
const RUBBER = new THREE.Color('#15171a');
const CHROME = new THREE.Color('#8a9099');

/** Boîte peinte d'une couleur de sommet, écrite dans le cube unité. */
function part(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  tint?: THREE.Color,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  // Blanc = « la teinte d'instance passe telle quelle » : c'est la caisse.
  const col = tint ?? new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) {
    c[i * 3] = col.r;
    c[i * 3 + 1] = col.g;
    c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/**
 * Voiture : longueur sur x, largeur sur z, posée par la base.
 *
 * Cinq volumes. Ce qui fait lire une voiture d'assez loin n'est ni la
 * carrosserie ni les roues mais le DÉCROCHEMENT du pavillon sur la caisse, et
 * la bande sombre du vitrage entre les deux.
 */
function makeCarGeometry(): THREE.BufferGeometry {
  return mergeGeometries(
    [
      part(0.98, 0.34, 0.9, 0, 0.34, 0),
      part(0.92, 0.18, 0.94, 0, 0.11, 0, RUBBER),
      part(0.52, 0.24, 0.8, -0.04, 0.63, 0, GLASS),
      part(0.48, 0.07, 0.78, -0.04, 0.78, 0),
      part(0.1, 0.09, 0.86, 0.47, 0.28, 0, CHROME),
    ],
    false,
  ) as THREE.BufferGeometry;
}

/**
 * Petit utilitaire : cabine avancée, caisson haut. La silhouette la plus
 * courante d'une rue de desserte, et celle qui se distingue le mieux d'une
 * voiture à cinquante mètres - c'est sa HAUTEUR qu'on lit, pas sa forme.
 */
function makeVanGeometry(): THREE.BufferGeometry {
  return mergeGeometries(
    [
      part(0.34, 0.6, 0.94, 0.31, 0.44, 0),
      part(0.64, 0.76, 0.98, -0.19, 0.52, 0),
      part(0.94, 0.2, 0.92, 0, 0.12, 0, RUBBER),
      part(0.06, 0.24, 0.86, 0.49, 0.6, 0, GLASS),
    ],
    false,
  ) as THREE.BufferGeometry;
}

/** Paire de feux, dans le cube unité : la même matrice que la caisse la pose. */
function makeLampGeometry(x: number, y: number, w: number): THREE.BufferGeometry {
  return mergeGeometries(
    [-1, 1].map((s) => {
      const g = new THREE.BoxGeometry(0.05, 0.09, w);
      g.translate(x, y, s * 0.32);
      return g;
    }),
    false,
  ) as THREE.BufferGeometry;
}

/** Portée de la fenêtre et nombre de véhicules par demi-rue, par palier. */
function tuning(quality: Quality): { ahead: number; perStreet: number } {
  if (quality === 'extraordinary') return { ahead: 170, perStreet: 3 };
  const level = qualityLevel(quality);
  if (level <= 1) return { ahead: 155, perStreet: 3 };
  if (level === 2) return { ahead: 130, perStreet: 3 };
  if (level === 3) return { ahead: 100, perStreet: 2 };
  // Aux deux derniers paliers la ville s'arrête de vivre : ce sont les paliers
  // où même les acrotères tombent.
  return { ahead: 0, perStreet: 0 };
}

export function Traffic() {
  const quality = usePerf((s) => s.quality);
  const { ahead, perStreet } = tuning(quality);
  const on = perStreet > 0;

  const built = useMemo(() => {
    const carGeo = makeCarGeometry();
    const vanGeo = makeVanGeometry();
    const headGeo = makeLampGeometry(0.47, 0.3, 0.18);
    const tailGeo = makeLampGeometry(-0.47, 0.36, 0.16);
    // Tôle laquée : lisse, un peu métallique. C'est le seul objet du décor qui
    // ait le droit de briller - une carrosserie accroche le soleil.
    const paintMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.36,
      metalness: 0.3,
    });
    const headMat = new THREE.MeshBasicMaterial({
      color: '#fff2d4',
      toneMapped: false,
      fog: true,
    });
    const tailMat = new THREE.MeshBasicMaterial({
      color: '#ff3324',
      toneMapped: false,
      fog: true,
    });
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, family: string) => {
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      // Sonde : `__probeCity()` sait alors dire combien de véhicules la scène
      // pose vraiment - une rue vide se discute mal sur une capture.
      mesh.userData.cityFamily = family;
      // Une voiture de trois mètres au fond d'une rue ne porte pas d'ombre
      // qu'on distingue de celle de la rue elle-même.
      mesh.userData.noShadow = true;
      mesh.castShadow = false;
      return mesh;
    };
    return {
      carGeo,
      vanGeo,
      headGeo,
      tailGeo,
      paintMat,
      headMat,
      tailMat,
      car: mk(carGeo, paintMat, CAR_CAP, 'voiture'),
      van: mk(vanGeo, paintMat, VAN_CAP, 'utilitaire'),
      head: mk(headGeo, headMat, LIGHT_CAP, 'phares'),
      tail: mk(tailGeo, tailMat, LIGHT_CAP, 'feux arrière'),
    };
  }, []);

  useEffect(
    () => () => {
      for (const m of [built.car, built.van, built.head, built.tail]) m.dispose();
      built.carGeo.dispose();
      built.vanGeo.dispose();
      built.headGeo.dispose();
      built.tailGeo.dispose();
      built.paintMat.dispose();
      built.headMat.dispose();
      built.tailMat.dispose();
    },
    [built],
  );

  const scratch = useMemo(
    () => ({
      mtx: new THREE.Matrix4(),
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
      pos: new THREE.Vector3(),
      scl: new THREE.Vector3(),
      rot: new THREE.Quaternion(),
      axis: new THREE.Vector3(0, 1, 0),
      color: new THREE.Color(),
      lane: makeLane(),
    }),
    [],
  );

  useFrame((state) => {
    if (!on) return;
    const sc = scratch;
    const t = state.clock.elapsedTime;
    const w = dayNightWeights(runtime.clockMin / 60);
    const night = Math.min(1, w.night + w.golden * 0.6);
    const lit = night > 0.06;
    // Le prototype PLATEAU pose une ville réelle, sans ses rues : la
    // circulation procédurale s'efface avec le ruban qui la portait.
    const real = plateauRuntime.coverage >= 0.5;

    built.car.visible = !real;
    built.van.visible = !real;
    built.head.visible = !real && lit;
    built.tail.visible = !real && lit;
    if (real) return;

    built.headMat.color.set('#fff2d4').multiplyScalar(0.7 + 1.1 * night);
    built.tailMat.color.set('#ff3324').multiplyScalar(0.5 + 1.1 * night);

    let cars = 0;
    let vans = 0;
    let lights = 0;

    const from = Math.floor((runtime.distance - BEHIND) / CELL_LEN);
    const to = Math.floor((runtime.distance + ahead) / CELL_LEN);
    // Les cellules sont parcourues du plus proche au plus lointain : si la
    // flotte est à court d'emplacements, ce sont les rues du fond qui se
    // taisent, et personne ne compte les voitures à cent cinquante mètres.
    for (let cell = from; cell <= to; cell++) {
      for (const side of [1, -1] as const) {
        const push = sidePush(side) + segEnv.citySetback;
        for (let i = 0; i < perStreet; i++) {
          const lane = sc.lane;
          if (!laneSlot(cell, side, i, perStreet, t, lane)) continue;
          const z = runtime.distance - lane.s;
          if (hiddenByStation(z)) continue;
          // Personne ne roule sur une rivière, et personne ne s'engage sur un
          // passage à niveau barrières baissées : la rue que l'ouvrage occupe se
          // vide. Une chaussée déserte devant un passage à niveau fermé est
          // exactement ce qu'on voit sur place.
          if (inSingularity(lane.s, 3)) continue;

          const target = lane.van ? built.van : built.car;
          const cap = lane.van ? VAN_CAP : CAR_CAP;
          const k = lane.van ? vans : cars;
          if (k >= cap) continue;
          if (lane.van) vans = k + 1;
          else cars = k + 1;

          const g = lane.grow;
          sc.pos.set(side * (lane.x + push), segEnv.cityY + ROAD_TOP, z);
          sc.rot.setFromAxisAngle(sc.axis, -lane.yaw + (lane.flip ? Math.PI : 0));
          sc.scl.set(
            (lane.van ? 4.9 : 4.3) * g,
            (lane.van ? 2.05 : 1.46) * g,
            (lane.van ? 1.88 : 1.72) * g,
          );
          sc.mtx.compose(sc.pos, sc.rot, sc.scl);
          target.setMatrixAt(k, sc.mtx);
          const palette = lane.van ? VAN_PAINT : PAINT;
          sc.color.set(palette[Math.floor(lane.paint * 997) % palette.length]);
          target.setColorAt(k, sc.color);

          // Feux : seulement ce qui roule, et seulement une fois la nuit
          // tombée. Une voiture garée tous phares allumés se remarque.
          if (lane.parked || !lit || lights >= LIGHT_CAP) continue;
          built.head.setMatrixAt(lights, sc.mtx);
          built.tail.setMatrixAt(lights, sc.mtx);
          lights++;
        }
      }
    }

    // Escamoter la queue de chaque flotte : la fenêtre respire d'une image à
    // l'autre, et un emplacement laissé en place resterait planté dans la ville.
    for (let k = cars; k < CAR_CAP; k++) built.car.setMatrixAt(k, sc.hidden);
    for (let k = vans; k < VAN_CAP; k++) built.van.setMatrixAt(k, sc.hidden);
    for (let k = lights; k < LIGHT_CAP; k++) {
      built.head.setMatrixAt(k, sc.hidden);
      built.tail.setMatrixAt(k, sc.hidden);
    }
    for (const m of [built.car, built.van, built.head, built.tail]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });

  if (!on) return null;
  return (
    <>
      <primitive object={built.car} />
      <primitive object={built.van} />
      <primitive object={built.head} />
      <primitive object={built.tail} />
    </>
  );
}
