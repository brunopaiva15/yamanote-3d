// Le ruban urbain : la ville en volume, posée dans le monde, que le train
// dépasse. Un InstancedMesh par côté, découpé en cellules de 40 m (voir
// systems/cityField) tenues dans un anneau glissant.
//
// Le groupe entier recule d'un `runtime.distance` : les instances gardent donc
// une abscisse FIXE et ne sont réécrites qu'au recyclage d'une cellule, soit
// une fois toutes les ~1,6 s à vitesse de croisière. Rien ne bouge par rapport
// au monde, tout bouge par rapport au train — c'est la seule façon d'obtenir
// une parallaxe juste entre le bord de voie, l'îlot et le fond.
//
// L'écartement de gare (systems/stationOcclusion) s'applique par côté, d'où les
// deux sous-groupes : à l'arrêt, la ville se range derrière le quai d'en face,
// comme les murs et les clôtures.

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
  buildCell,
  makeCellBuffer,
  updateCityAnchor,
} from '../../systems/cityField';
import { makeCityMaterial } from './cityMaterial';

/** Niveau du sol extérieur, partagé avec Scenery / Landmarks. */
const BASE_Y = -1.1;

/**
 * Longueur de l'anneau et allègement des rangs par palier de qualité.
 *
 * L'anneau ne descend jamais sous 440 m (± 220 m) : c'est la portée de la brume
 * de jour, en deçà on verrait la ville apparaître à vue. Ce qui s'allège, c'est
 * la DENSITÉ de chaque rang, pas l'étendue.
 */
function tuning(level: PerfLevel): { cells: number; rankScale: number } {
  if (level <= 1) return { cells: 13, rankScale: 1 };
  if (level === 2) return { cells: 12, rankScale: 0.8 };
  if (level === 3) return { cells: 11, rankScale: 0.6 };
  return { cells: 11, rankScale: 0.4 };
}

export function CityRibbon() {
  const level = usePerf((s) => qualityLevel(s.quality));
  const { cells, rankScale } = tuning(level);

  const zRoot = useRef<THREE.Group>(null);
  const sideRoots = useRef<(THREE.Group | null)[]>([]);

  const built = useMemo(() => {
    const city = makeCityMaterial();
    const perSide = cells * CELL_CAPACITY;
    const sides = ([1, -1] as const).map((side) => {
      // Une géométrie par côté : les attributs d'instance vivent dessus, deux
      // InstancedMesh ne peuvent donc pas la partager.
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const accent = new THREE.InstancedBufferAttribute(new Float32Array(perSide * 3), 3);
      const jitter = new THREE.InstancedBufferAttribute(new Float32Array(perSide * 2), 2);
      const trim = new THREE.InstancedBufferAttribute(new Float32Array(perSide * 2), 2);
      accent.setUsage(THREE.DynamicDrawUsage);
      jitter.setUsage(THREE.DynamicDrawUsage);
      trim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAccent', accent);
      geo.setAttribute('aJitter', jitter);
      geo.setAttribute('aTrim', trim);
      const mesh = new THREE.InstancedMesh(geo, city.material, perSide);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // L'anneau couvre ± 220 m de part et d'autre : la sphère englobante de la
      // boîte unité ne veut rien dire ici, on désactive le tri par frustum.
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return { side, geo, mesh, accent, jitter, trim };
    });
    return { city, sides, perSide };
  }, [cells]);

  useEffect(
    () => () => {
      for (const s of built.sides) {
        s.mesh.dispose();
        s.geo.dispose();
      }
      built.city.dispose();
    },
    [built],
  );

  // Objets de travail : aucune allocation en régime établi.
  const scratch = useMemo(
    () => ({
      buf: makeCellBuffer(),
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
      const base = slot * CELL_CAPACITY;
      for (const s of built.sides) {
        const n = buildCell(cell, s.side, sc.buf, rankScale);
        for (let i = 0; i < CELL_CAPACITY; i++) {
          const idx = base + i;
          if (i >= n) {
            s.mesh.setMatrixAt(idx, sc.hidden);
            continue;
          }
          const b = sc.buf[i];
          sc.pos.set(s.side * b.x, BASE_Y + b.h / 2, st.origin - b.s);
          sc.scl.set(b.d, b.h, b.w);
          sc.mtx.compose(sc.pos, sc.rot, sc.scl);
          s.mesh.setMatrixAt(idx, sc.mtx);
          sc.color.set(b.facade).multiplyScalar(b.shade);
          s.mesh.setColorAt(idx, sc.color);
          sc.accent.set(b.accent);
          s.accent.setXYZ(idx, sc.accent.r, sc.accent.g, sc.accent.b);
          s.jitter.setXY(idx, b.jx, b.jy);
          s.trim.setXY(idx, b.glow, b.socle);
        }
        s.mesh.instanceMatrix.needsUpdate = true;
        if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
        s.accent.needsUpdate = true;
        s.jitter.needsUpdate = true;
        s.trim.needsUpdate = true;
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

    // --- Le monde recule ---
    if (zRoot.current) zRoot.current.position.z = runtime.distance - st.origin;
    for (let i = 0; i < built.sides.length; i++) {
      const root = sideRoots.current[i];
      if (root) root.position.x = built.sides[i].side * sidePush(built.sides[i].side);
    }

    // --- Nuit : les fenêtres, vitrines et néons s'allument ---
    const w = dayNightWeights(runtime.clockMin / 60);
    built.city.night.value = Math.min(1, w.night + w.golden * 0.35);
  });

  return (
    <group ref={zRoot}>
      {built.sides.map((s, i) => (
        <group
          key={s.side}
          ref={(g) => {
            sideRoots.current[i] = g;
          }}
        >
          <primitive object={s.mesh} />
        </group>
      ))}
    </group>
  );
}
