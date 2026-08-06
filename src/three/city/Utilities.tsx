// Les poteaux et les fils de la rue qui longe la voie.
//
// Aucune rue de Tokyo n'est crédible sans son ciel encombré de câbles. Le
// réseau y est AÉRIEN presque partout - c'est une singularité japonaise, tenue
// par les tremblements de terre : un câble tombé se répare en une matinée, une
// canalisation enterrée en trois semaines - et le poteau de béton 電柱, avec ses
// bras, ses isolateurs et son transformateur en fût, est un objet aussi présent
// dans le paysage qu'un lampadaire ailleurs.
//
// Il se tient entre l'emprise ferroviaire et le premier rang bâti, à dix mètres
// et demi de l'axe : assez près pour défiler vite - c'est ce qui vend la
// vitesse -, assez loin pour ne pas masquer la ville. Un tous les vingt-six
// mètres, l'entraxe réel d'une rue de desserte.
//
// Deux géométries posées par les MÊMES matrices, l'idiome de three/catenary :
// la structure (béton et acier) et les fils (sombres, fins). Chaque portée est
// accrochée à son poteau et court jusqu'au suivant, si bien que des portées
// identiques espacées de SPACING pavent la rue sans couture, y compris au
// recyclage par `runtime.distance`.

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
import { inSingularity } from '../../systems/singularity';
import { cityRelief } from '../../systems/terrain';

/** Abscisse des poteaux (m) : entre l'emprise ferroviaire et le premier rang. */
const POLE_X = 10.4;
/** Entraxe des poteaux = longueur d'une portée (m). */
const SPACING = 26;
/** Hauteur du fût (m). */
const POLE_H = 9.4;
/** Cote du luminaire, et sa portée depuis le fût (m). */
const LAMP_Y = 5.98;
const LAMP_REACH = 1.1;

function boxAt(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cylAt(
  rt: number,
  rb: number,
  h: number,
  seg: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

/**
 * Fût de béton, bras, isolateurs, transformateur, et la potence d'un
 * lampadaire.
 *
 * Le fût est FUSELÉ, comme un vrai poteau de béton centrifugé : c'est ce qui le
 * distingue d'un tuyau. Les bras sont perpendiculaires aux fils, donc en
 * travers de la voie, et c'est leur profil qu'on lit en passant dessous.
 */
function buildPole(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cylAt(0.1, 0.17, POLE_H, 8, 0, POLE_H / 2, 0));

  // Deux bras superposés portent la haute tension. L'isolateur est réduit à un
  // seul volume clair par point d'accroche : à dix mètres, une ailette de plus
  // ne se voit pas, et il en passe deux mille par minute.
  for (const [y, half] of [
    [8.9, 0.78],
    [8.15, 0.6],
  ] as const) {
    parts.push(boxAt(half * 2, 0.08, 0.08, 0, y, 0));
    for (const s of [-1, 0, 1]) {
      parts.push(cylAt(0.06, 0.06, 0.16, 6, s * half * 0.92, y + 0.13, 0));
    }
  }

  // Transformateur en fût, sur sa console : la masse qui déséquilibre la
  // silhouette, et sans laquelle un poteau japonais ressemble à un poteau
  // télégraphique.
  parts.push(cylAt(0.29, 0.29, 0.86, 10, 0.4, 7.1, 0));
  parts.push(boxAt(0.5, 0.07, 0.07, 0.22, 7.55, 0));
  parts.push(boxAt(0.5, 0.07, 0.07, 0.22, 6.68, 0));

  // Coffret de raccordement basse tension, et le boîtier de la ligne de
  // télécommunications, plus bas : deux petits volumes qui ferment le fût.
  parts.push(boxAt(0.3, 0.5, 0.22, 0.13, 5.5, 0));
  parts.push(boxAt(0.24, 0.24, 0.34, 0.12, 4.5, 0));

  // Potence d'éclairage, tournée vers la rue : c'est elle qui éclaire la
  // chaussée la nuit, et le seul luminaire de rue que la ville ait.
  parts.push(boxAt(1.05, 0.07, 0.07, 0.62, LAMP_Y + 0.07, 0));
  parts.push(boxAt(0.38, 0.1, 0.24, LAMP_REACH, LAMP_Y, 0));
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

/** Un fil tendu d'un poteau au suivant, avec sa flèche. */
function wire(x: number, y: number, sag: number, radius: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const N = 6;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Chaînette approchée par une parabole : à cette échelle l'œil ne fait pas
    // la différence, et la courbe coûte six points au lieu d'une intégrale.
    pts.push(new THREE.Vector3(x, y - sag * 4 * t * (1 - t), t * SPACING));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, radius, 3, false);
}

/**
 * Le faisceau d'une portée.
 *
 * Ce qui fait l'encombrement d'un ciel de Tokyo n'est pas le nombre de fils
 * mais leurs FLÈCHES INÉGALES : la haute tension est tendue et presque droite,
 * la basse tension pend, et le gros câble de télécommunications pend franchement
 * plus bas que tout le reste. Des fils parallèles se liraient comme une portée
 * de musique.
 */
function buildWires(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 0, 1]) parts.push(wire(s * 0.72, 9.03, 0.22, 0.022));
  for (const s of [-1, 1]) parts.push(wire(s * 0.55, 8.28, 0.3, 0.02));
  parts.push(wire(0.1, 5.62, 0.5, 0.026));
  parts.push(wire(0.16, 4.6, 0.72, 0.045));
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

/** Nombre de poteaux par côté, par palier. */
function tuning(quality: Quality): number {
  const level = qualityLevel(quality);
  if (quality === 'extraordinary' || level <= 1) return 16;
  if (level === 2) return 14;
  if (level === 3) return 11;
  // Aux deux derniers paliers, la rue se tait : c'est le poste le plus cher du
  // décor par rapport à ce qu'il ajoute quand on ne peut plus rien détailler.
  return 0;
}

export function Utilities() {
  const quality = usePerf((s) => s.quality);
  const count = tuning(quality);

  const built = useMemo(() => {
    const poleGeo = buildPole();
    const wireGeo = buildWires();
    // Béton centrifugé : un gris légèrement chaud, plus clair que l'acier de la
    // caténaire - sinon les deux réseaux se confondent en un seul fouillis.
    const poleMat = new THREE.MeshStandardMaterial({
      color: '#b0aca4',
      roughness: 0.78,
      metalness: 0.08,
    });
    const wireMat = new THREE.MeshStandardMaterial({
      color: '#22242a',
      roughness: 0.7,
      metalness: 0.2,
    });
    // Le foyer du luminaire : non éclairé, hors correction de tons, et caché
    // tout à fait de jour - un lampadaire allumé à quinze heures se remarque.
    const lampMat = new THREE.MeshBasicMaterial({ color: '#ffe4b0', toneMapped: false, fog: true });
    // Un volume plutôt qu'un plan : depuis un siège, le foyer se lit par en
    // dessous, et de profil quand la rame l'a dépassé.
    const lampGeo = new THREE.BoxGeometry(0.3, 0.06, 0.18);
    const sides = ([1, -1] as const).map((side) => {
      const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, family: string) => {
        const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
        mesh.frustumCulled = false;
        // Sonde : voir `__probeCity()`.
        mesh.userData.cityFamily = `${family} ${side === 1 ? '+x' : '-x'}`;
        // Un fil ne porte pas d'ombre lisible, et un poteau de dix mètres en
        // porterait une qui balaie toute la ville : les deux s'en passent.
        mesh.userData.noShadow = true;
        mesh.castShadow = false;
        return mesh;
      };
      return {
        side,
        pole: mk(poleGeo, poleMat, 'poteau'),
        wire: mk(wireGeo, wireMat, 'fils'),
        lamp: mk(lampGeo, lampMat, 'foyer'),
      };
    });
    return { poleGeo, wireGeo, lampGeo, poleMat, wireMat, lampMat, sides };
  }, [count]);

  useEffect(
    () => () => {
      for (const s of built.sides) {
        s.pole.dispose();
        s.wire.dispose();
        s.lamp.dispose();
      }
      built.poleGeo.dispose();
      built.wireGeo.dispose();
      built.lampGeo.dispose();
      built.poleMat.dispose();
      built.wireMat.dispose();
      built.lampMat.dispose();
    },
    [built],
  );

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

  useFrame(() => {
    if (!count) return;
    const sc = scratch;
    const span = count * SPACING;

    // Les foyers ne s'allument qu'à la tombée du jour. La rue de Tokyo est
    // éclairée en blanc froid depuis le passage aux diodes, mais le halo qu'on
    // en garde de l'intérieur d'un wagon reste chaud : c'est la vitre.
    const w = dayNightWeights(runtime.clockMin / 60);
    const on = Math.min(1, w.night + w.golden * 0.5);
    built.lampMat.color.set('#ffe4b0').multiplyScalar(on * 1.5);
    // Le prototype PLATEAU pose une ville réelle : le mobilier procédural
    // s'efface avec le ruban, sinon un poteau se planterait dans un immeuble
    // relevé sur le terrain.
    const real = plateauRuntime.coverage >= 0.5;

    for (const s of built.sides) {
      s.pole.visible = !real;
      s.wire.visible = !real;
      // Un maillage caché ne coûte pas d'appel de rendu : le foyer est donc
      // gratuit sur les deux tiers du cycle horaire.
      s.lamp.visible = !real && on > 0.03;
      if (real) continue;
      // Le poteau présente la MÊME face à la rue des deux côtés de la voie :
      // sa potence surplombe toujours la chaussée, jamais le ballast, et son
      // transformateur pèse toujours du côté des façades.
      const yaw = s.side === 1 ? 0 : Math.PI;
      const x = s.side * (POLE_X + sidePush(s.side) + segEnv.citySetback);
      for (let i = 0; i < count; i++) {
        const z = ((runtime.distance + i * SPACING) % span) - span / 2;
        // Un poteau planté dans le chenal d'une rivière, ou au milieu d'une
        // chaussée de passage à niveau, tient debout mais n'a rien à y faire.
        if (hiddenByStation(z) || inSingularity(runtime.distance - z, 1.5)) {
          s.pole.setMatrixAt(i, sc.hidden);
          s.wire.setMatrixAt(i, sc.hidden);
          s.lamp.setMatrixAt(i, sc.hidden);
          continue;
        }
        // Le pied du poteau suit le relief de la chaussée qu'il éclaire. Seize
        // poteaux à vingt-six mètres couvrent quatre cents mètres de voie, sur
        // lesquels le sol du 国土地理院 varie de plus d'une hauteur de poteau :
        // à cote fixe, la moitié de la file flottait au-dessus de la rue.
        const gy = segEnv.cityY + cityRelief(runtime.distance - z, Math.abs(x), s.side);
        sc.pos.set(x, gy, z);
        sc.rot.setFromAxisAngle(sc.axis, yaw);
        sc.scl.set(1, 1, 1);
        sc.mtx.compose(sc.pos, sc.rot, sc.scl);
        s.pole.setMatrixAt(i, sc.mtx);
        s.wire.setMatrixAt(i, sc.mtx);
        // Sous-face du foyer : posée sous la potence, elle regarde le sol.
        sc.pos.set(x + s.side * LAMP_REACH, gy + LAMP_Y - 0.09, z);
        sc.rot.identity();
        sc.mtx.compose(sc.pos, sc.rot, sc.scl);
        s.lamp.setMatrixAt(i, sc.mtx);
      }
      s.pole.instanceMatrix.needsUpdate = true;
      s.wire.instanceMatrix.needsUpdate = true;
      s.lamp.instanceMatrix.needsUpdate = true;
    }
  });

  if (!count) return null;
  return (
    <>
      {built.sides.map((s) => (
        <group key={s.side}>
          <primitive object={s.pole} />
          <primitive object={s.wire} />
          <primitive object={s.lamp} />
        </group>
      ))}
    </>
  );
}
