// Le ruban urbain : la ville en volume, posée dans le monde, que le train
// dépasse. Deux InstancedMesh par côté — les corps de bâtiment et leurs volumes
// secondaires (acrotères, édicules de toiture, chaussées) — découpés en
// cellules de 40 m (voir systems/cityField) tenues dans un anneau glissant.
//
// Le groupe entier recule d'un `runtime.distance` : les instances gardent donc
// une abscisse FIXE et ne sont réécrites qu'au recyclage d'une cellule, soit
// une fois toutes les ~1,6 s à vitesse de croisière. Rien ne bouge par rapport
// au monde, tout bouge par rapport au train — c'est la seule façon d'obtenir
// une parallaxe juste entre le bord de voie, l'îlot et le fond.
//
// TROIS DÉPLACEMENTS D'ENSEMBLE, dans cet ordre de nidification :
//   · l'élévation du tronçon (segEnv.cityY) — la ville descend de sept mètres
//     sous un viaduc, remonte sur la crête des murs en tranchée ;
//   · le recul du monde en z ;
//   · l'écartement latéral, par côté : celui de la gare (stationOcclusion) et
//     celui du faisceau de voies d'un corridor (segEnv.citySetback).
//
// Le sol urbain vit ici aussi, et non plus dans Scenery : il porte la même
// élévation que la ville, et il est fendu en deux nappes qui laissent
// l'emprise de la voie libre — une nappe unique passerait au-dessus du train
// dès qu'elle monte sur les murs d'une tranchée.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../../systems/runtime';
import { dayNightWeights } from '../../systems/daynight';
import { segEnv } from '../../systems/segmentEnv';
import { sidePush } from '../../systems/stationOcclusion';
import { useStore } from '../../store';
import { qualityLevel, usePerf, type PerfLevel } from '../../systems/perf';
import {
  CELL_CAPACITY,
  CELL_LEN,
  PROP_CAPACITY,
  buildCell,
  buildCellProps,
  makeCellBuffer,
  makePropBuffer,
  updateCityAnchor,
} from '../../systems/cityField';
import { GROUND_TILE, makeCityGroundTexture } from '../../textures/city';
import { makeCityMaterial } from './cityMaterial';

/** Emprise laissée libre de part et d'autre de l'axe : ballast et voie. */
const GROUND_INNER = 5;
/** Largeur d'une nappe de sol urbain (m) : au-delà du dernier rang bâti. */
const GROUND_SPAN = 170;
/** Longueur des nappes (m) : la vue en biais vers le fond du wagon porte loin. */
const GROUND_LEN = 460;

/**
 * Longueur de l'anneau et allègement des rangs par palier de qualité.
 *
 * L'anneau ne descend jamais sous 440 m (± 220 m) : c'est la portée de la brume
 * de jour, en deçà on verrait la ville apparaître à vue. Ce qui s'allège, c'est
 * la DENSITÉ de chaque rang, pas l'étendue.
 */
function tuning(level: PerfLevel): { cells: number; rankScale: number; props: boolean } {
  if (level <= 1) return { cells: 13, rankScale: 1, props: true };
  if (level === 2) return { cells: 12, rankScale: 0.8, props: true };
  if (level === 3) return { cells: 11, rankScale: 0.6, props: true };
  return { cells: 11, rankScale: 0.4, props: false };
}

export function CityRibbon() {
  const level = usePerf((s) => qualityLevel(s.quality));
  const { cells, rankScale, props } = tuning(level);

  const yRoot = useRef<THREE.Group>(null);
  const zRoot = useRef<THREE.Group>(null);
  const sideRoots = useRef<(THREE.Group | null)[]>([]);

  const built = useMemo(() => {
    const city = makeCityMaterial();
    const bodyPer = cells * CELL_CAPACITY;
    const propPer = cells * PROP_CAPACITY;

    const mkMesh = (count: number) => {
      // Une géométrie par maillage : les attributs d'instance vivent dessus,
      // deux InstancedMesh ne peuvent donc pas la partager.
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const accent = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      const jitter = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
      const trim = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      accent.setUsage(THREE.DynamicDrawUsage);
      jitter.setUsage(THREE.DynamicDrawUsage);
      trim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAccent', accent);
      geo.setAttribute('aJitter', jitter);
      geo.setAttribute('aTrim', trim);
      const mesh = new THREE.InstancedMesh(geo, city.material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // L'anneau couvre ± 220 m de part et d'autre : la sphère englobante de la
      // boîte unité ne veut rien dire ici, on désactive le tri par frustum.
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return { geo, mesh, accent, jitter, trim };
    };

    const sides = ([1, -1] as const).map((side) => ({
      side,
      body: mkMesh(bodyPer),
      prop: props ? mkMesh(propPer) : null,
    }));

    const groundTex = makeCityGroundTexture();
    groundTex.repeat.set(GROUND_SPAN / GROUND_TILE, GROUND_LEN / GROUND_TILE);
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex, fog: true });

    return { city, sides, groundTex, groundMat };
  }, [cells, props]);

  useEffect(
    () => () => {
      for (const s of built.sides) {
        s.body.mesh.dispose();
        s.body.geo.dispose();
        s.prop?.mesh.dispose();
        s.prop?.geo.dispose();
      }
      built.groundMat.dispose();
      built.groundTex.dispose();
      built.city.dispose();
    },
    [built],
  );

  // Objets de travail : aucune allocation en régime établi.
  const scratch = useMemo(
    () => ({
      buf: makeCellBuffer(),
      propBuf: makePropBuffer(),
      mtx: new THREE.Matrix4(),
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
      pos: new THREE.Vector3(),
      scl: new THREE.Vector3(),
      rot: new THREE.Quaternion(),
      color: new THREE.Color(),
      accent: new THREE.Color(),
    }),
    [],
  );

  const ring = useRef({ first: 0, origin: 0, ready: false });

  useFrame(() => {
    const { index } = useStore.getState();
    updateCityAnchor(index, segEnv.p);

    const st = ring.current;
    const sc = scratch;

    const writeCell = (cell: number) => {
      const slot = ((cell % cells) + cells) % cells;
      for (const s of built.sides) {
        const n = buildCell(cell, s.side, sc.buf, rankScale);

        // --- Corps de bâtiment ---
        const base = slot * CELL_CAPACITY;
        for (let i = 0; i < CELL_CAPACITY; i++) {
          const idx = base + i;
          if (i >= n) {
            s.body.mesh.setMatrixAt(idx, sc.hidden);
            continue;
          }
          const b = sc.buf[i];
          sc.pos.set(s.side * b.x, b.h / 2, st.origin - b.s);
          sc.scl.set(b.d, b.h, b.w);
          sc.mtx.compose(sc.pos, sc.rot, sc.scl);
          s.body.mesh.setMatrixAt(idx, sc.mtx);
          sc.color.set(b.facade).multiplyScalar(b.shade);
          s.body.mesh.setColorAt(idx, sc.color);
          sc.accent.set(b.accent);
          s.body.accent.setXYZ(idx, sc.accent.r, sc.accent.g, sc.accent.b);
          s.body.jitter.setXY(idx, b.jx, b.jy);
          s.body.trim.setXYZ(idx, b.glow, b.socle, 0);
        }
        s.body.mesh.instanceMatrix.needsUpdate = true;
        if (s.body.mesh.instanceColor) s.body.mesh.instanceColor.needsUpdate = true;
        s.body.accent.needsUpdate = true;
        s.body.jitter.needsUpdate = true;
        s.body.trim.needsUpdate = true;

        // --- Acrotères, édicules, chaussées ---
        if (!s.prop) continue;
        const np = buildCellProps(cell, s.side, sc.buf, n, sc.propBuf);
        const pBase = slot * PROP_CAPACITY;
        for (let i = 0; i < PROP_CAPACITY; i++) {
          const idx = pBase + i;
          if (i >= np) {
            s.prop.mesh.setMatrixAt(idx, sc.hidden);
            continue;
          }
          const p = sc.propBuf[i];
          sc.pos.set(s.side * p.x, p.y + p.h / 2, st.origin - p.s);
          sc.scl.set(p.d, p.h, p.w);
          sc.mtx.compose(sc.pos, sc.rot, sc.scl);
          s.prop.mesh.setMatrixAt(idx, sc.mtx);
          sc.color.set(p.tone);
          s.prop.mesh.setColorAt(idx, sc.color);
          s.prop.accent.setXYZ(idx, 1, 1, 1);
          s.prop.jitter.setXY(idx, 0, 0);
          s.prop.trim.setXYZ(idx, 0, 0, 1);
        }
        s.prop.mesh.instanceMatrix.needsUpdate = true;
        if (s.prop.mesh.instanceColor) s.prop.mesh.instanceColor.needsUpdate = true;
        s.prop.accent.needsUpdate = true;
        s.prop.jitter.needsUpdate = true;
        s.prop.trim.needsUpdate = true;
      }
    };

    // --- Anneau glissant : une cellule sort derrière, une entre devant ---
    const want = Math.floor(runtime.distance / CELL_LEN) - (cells >> 1);
    const drift = runtime.distance - st.origin;
    if (!st.ready || Math.abs(want - st.first) > cells || drift < 0 || drift > 12000) {
      // Reprise à froid, saut de position, ou dérive numérique : on rebâtit
      // l'anneau entier et on ré-ancre l'origine (une poignée de fois par heure,
      // pour quelques centaines de matrices — invisible).
      st.origin = Math.floor(runtime.distance / CELL_LEN) * CELL_LEN;
      st.first = want;
      for (let k = 0; k < cells; k++) writeCell(want + k);
      st.ready = true;
    } else {
      while (st.first < want) {
        writeCell(st.first + cells);
        st.first++;
      }
    }

    // --- Élévation du tronçon, recul du monde, écartements latéraux ---
    if (yRoot.current) yRoot.current.position.y = segEnv.cityY;
    if (zRoot.current) zRoot.current.position.z = runtime.distance - st.origin;
    for (let i = 0; i < built.sides.length; i++) {
      const root = sideRoots.current[i];
      const side = built.sides[i].side;
      if (root) root.position.x = side * (sidePush(side) + segEnv.citySetback);
    }

    // --- Sol défilant ---
    built.groundTex.offset.y = runtime.distance / GROUND_TILE;

    // --- Nuit : les fenêtres, vitrines et néons s'allument ---
    const w = dayNightWeights(runtime.clockMin / 60);
    built.city.night.value = Math.min(1, w.night + w.golden * 0.35);
  });

  return (
    <group ref={yRoot}>
      <group ref={zRoot}>
        {built.sides.map((s, i) => (
          <group
            key={s.side}
            ref={(g) => {
              sideRoots.current[i] = g;
            }}
          >
            <primitive object={s.body.mesh} />
            {s.prop && <primitive object={s.prop.mesh} />}
          </group>
        ))}
      </group>

      {/* Sol urbain : deux nappes, l'emprise de la voie laissée libre. */}
      {([1, -1] as const).map((side) => (
        <mesh
          key={`ground${side}`}
          position={[side * (GROUND_INNER + GROUND_SPAN / 2), -0.04, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={built.groundMat}
        >
          <planeGeometry args={[GROUND_SPAN, GROUND_LEN]} />
        </mesh>
      ))}
    </group>
  );
}
