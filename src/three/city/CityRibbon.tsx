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
// Le sol urbain vit ici aussi, et non plus dans Wayside : il porte la même
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
  PROP_CAPS,
  type PropKind,
  buildCell,
  buildCellProps,
  makeCellBuffer,
  makePropBuffer,
  updateCityAnchor,
} from '../../systems/cityField';
import { GROUND_TILE, makeCityGroundTexture, makeSignageTexture } from '../../textures/city';
import { makeCityMaterial } from './cityMaterial';
import { makeGroveGeometry, makeGroveMaterial, makeHipRoofGeometry } from './cityProps';
import { seasonNow } from '../../systems/season';
import { weather } from '../../systems/weather';

/** Rebond de l'éclairage public sur le sol, la nuit. */
const STREET_BOUNCE = new THREE.Color('#ffb877');
/** Rue enneigée : le gris bleuté d'une neige de ville, jamais du blanc pur. */
const SNOW_GROUND = new THREE.Color('#dfe4ea');

/** Axe de rotation des enseignes, qui regardent toutes la voie. */
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** Familles de volumes secondaires, dans l'ordre d'escamotage. */
const PROP_KINDS: PropKind[] = ['box', 'hip', 'tree', 'sign'];

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
function tuning(level: PerfLevel): {
  cells: number;
  rankScale: number;
  props: boolean;
  signs: boolean;
} {
  if (level <= 1) return { cells: 13, rankScale: 1, props: true, signs: true };
  if (level === 2) return { cells: 12, rankScale: 0.8, props: true, signs: true };
  if (level === 3) return { cells: 11, rankScale: 0.6, props: true, signs: true };
  // Aux deux derniers paliers, acrotères, croupes et bosquets tombent — mais
  // pas les enseignes : un quad par bâtiment, et c'est tout ce qui reste de
  // reconnaissable à Akihabara ou Shin-Ōkubo une fois la nuit tombée.
  return { cells: 11, rankScale: 0.4, props: false, signs: true };
}

export function CityRibbon() {
  const level = usePerf((s) => qualityLevel(s.quality));
  const { cells, rankScale, props, signs } = tuning(level);

  const yRoot = useRef<THREE.Group>(null);
  const zRoot = useRef<THREE.Group>(null);
  const sideRoots = useRef<(THREE.Group | null)[]>([]);

  const built = useMemo(() => {
    const city = makeCityMaterial();
    const bodyPer = cells * CELL_CAPACITY;

    const mkMesh = (count: number, geometry?: THREE.BufferGeometry) => {
      // Une géométrie par maillage : les attributs d'instance vivent dessus,
      // deux InstancedMesh ne peuvent donc pas la partager.
      const geo = geometry ?? new THREE.BoxGeometry(1, 1, 1);
      const accent = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      const jitter = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
      const trim = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
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

    // Bosquets : matériau propre, qui garde le tronc brun quand la frondaison
    // rougit et qui dépouille l'arbre l'hiver. Il ne passe pas par le matériau
    // de ville — un feuillage n'a ni fenêtres ni devanture.
    const grove = makeGroveMaterial();
    const groveMat = grove.material;
    // Enseignes : non éclairées, teintées par instance, dont le NIVEAU suit
    // l'heure — le panneau est terne le jour et éclate la nuit.
    const signTex = makeSignageTexture();
    const signMat = new THREE.MeshBasicMaterial({
      map: signTex,
      toneMapped: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    const signGeo = new THREE.PlaneGeometry(1, 1);
    const groveGeo = makeGroveGeometry();
    const hipGeo = makeHipRoofGeometry();

    const mkPlain = (count: number, geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return mesh;
    };

    const sides = ([1, -1] as const).map((side) => ({
      side,
      body: mkMesh(bodyPer),
      // Les acrotères, édicules et chaussées passent par le matériau de ville
      // (drapeau « nu ») ; les toitures en croupe aussi, avec leur pyramide.
      box: props ? mkMesh(cells * PROP_CAPS.box) : null,
      hip: props ? mkMesh(cells * PROP_CAPS.hip, hipGeo.clone()) : null,
      tree: props ? mkPlain(cells * PROP_CAPS.tree, groveGeo, groveMat) : null,
      sign: signs ? mkPlain(cells * PROP_CAPS.sign, signGeo, signMat) : null,
    }));

    const groundTex = makeCityGroundTexture();
    groundTex.repeat.set(GROUND_SPAN / GROUND_TILE, GROUND_LEN / GROUND_TILE);
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex, fog: true });

    return { city, sides, groundTex, groundMat, grove, groveGeo, signMat, signTex, signGeo, hipGeo };
  }, [cells, props, signs]);

  useEffect(
    () => () => {
      for (const s of built.sides) {
        s.body.mesh.dispose();
        s.body.geo.dispose();
        s.box?.mesh.dispose();
        s.box?.geo.dispose();
        s.hip?.mesh.dispose();
        s.hip?.geo.dispose();
        s.tree?.dispose();
        s.sign?.dispose();
      }
      built.groveGeo.dispose();
      built.grove.dispose();
      built.signGeo.dispose();
      built.signTex.dispose();
      built.signMat.dispose();
      built.hipGeo.dispose();
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
      // Curseurs par famille, remis à zéro à chaque cellule : le fichier
      // promet zéro allocation en régime établi, un littéral par cellule la
      // romprait.
      used: { box: 0, hip: 0, tree: 0, sign: 0 } as Record<PropKind, number>,
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
          const b = i < n ? sc.buf[i] : null;
          // Un bosquet REMPLACE le bâtiment : son emplacement reste vide.
          if (!b || b.grove) {
            s.body.mesh.setMatrixAt(idx, sc.hidden);
            continue;
          }
          sc.pos.set(s.side * b.x, b.h / 2, st.origin - b.s);
          sc.scl.set(b.d, b.h, b.w);
          sc.mtx.compose(sc.pos, sc.rot, sc.scl);
          s.body.mesh.setMatrixAt(idx, sc.mtx);
          sc.color.set(b.facade).multiplyScalar(b.shade);
          s.body.mesh.setColorAt(idx, sc.color);
          sc.accent.set(b.accent);
          s.body.accent.setXYZ(idx, sc.accent.r, sc.accent.g, sc.accent.b);
          s.body.jitter.setXY(idx, b.jx, b.jy);
          s.body.trim.setXYZW(idx, b.glow, b.socle, 0, b.warm);
        }
        s.body.mesh.instanceMatrix.needsUpdate = true;
        if (s.body.mesh.instanceColor) s.body.mesh.instanceColor.needsUpdate = true;
        s.body.accent.needsUpdate = true;
        s.body.jitter.needsUpdate = true;
        s.body.trim.needsUpdate = true;

        // --- Acrotères, croupes, bosquets, enseignes ---
        if (!s.sign) continue;
        const np = buildCellProps(cell, s.side, sc.buf, n, sc.propBuf);
        // Un curseur par famille : le générateur les entremêle dans un seul
        // tampon, le rendu les répartit dans quatre maillages.
        const used = sc.used;
        for (const kind of PROP_KINDS) used[kind] = 0;
        for (let i = 0; i < np; i++) {
          const p = sc.propBuf[i];
          const k = used[p.kind];
          if (k >= PROP_CAPS[p.kind]) continue;
          used[p.kind] = k + 1;
          const idx = slot * PROP_CAPS[p.kind] + k;

          if (p.kind !== 'sign' && (!s.box || !s.hip || !s.tree)) continue;

          if (p.kind === 'sign') {
            // Panneau plaqué sur la face qui regarde la voie, donc tourné vers
            // l'axe : un quart de tour, dans le sens du côté.
            sc.pos.set(s.side * p.x, p.y + p.h / 2, st.origin - p.s);
            sc.rot.setFromAxisAngle(Y_AXIS, s.side === 1 ? -Math.PI / 2 : Math.PI / 2);
            sc.scl.set(p.w, p.h, 1);
            sc.mtx.compose(sc.pos, sc.rot, sc.scl);
            s.sign.setMatrixAt(idx, sc.mtx);
            sc.color.set(p.tone);
            s.sign.setColorAt(idx, sc.color);
            sc.rot.identity();
            continue;
          }

          // Bosquets et croupes sont écrits dans un cube unité POSÉ PAR LA
          // BASE ; les volumes en boîte, eux, sont centrés.
          const baseY = p.kind === 'box' ? p.y + p.h / 2 : p.y;
          sc.pos.set(s.side * p.x, baseY, st.origin - p.s);

          if (p.kind === 'tree' && s.tree) {
            const spread = Math.min(p.h * 1.15, Math.max(p.d, p.w));
            sc.scl.set(spread, p.h, spread);
            sc.mtx.compose(sc.pos, sc.rot, sc.scl);
            s.tree.setMatrixAt(idx, sc.mtx);
            // La teinte vient du jour, pas du générateur : c'est la saison qui
            // décide, et une cellule reste posée plusieurs secondes.
            const se = seasonNow();
            sc.color.set(p.roll < se.blossom ? se.blossomTone : se.foliage[p.variant]);
            s.tree.setColorAt(idx, sc.color);
            continue;
          }

          sc.scl.set(p.d, p.h, p.w);
          sc.mtx.compose(sc.pos, sc.rot, sc.scl);
          const target = p.kind === 'hip' ? s.hip : s.box;
          if (!target) continue;
          target.mesh.setMatrixAt(idx, sc.mtx);
          sc.color.set(p.tone);
          target.mesh.setColorAt(idx, sc.color);
          target.accent.setXYZ(idx, 1, 1, 1);
          target.jitter.setXY(idx, 0, 0);
          target.trim.setXYZW(idx, 0, 0, 1, 1);
        }
        // Escamoter les emplacements non pourvus de la cellule.
        for (const kind of PROP_KINDS) {
          const cap = PROP_CAPS[kind];
          for (let k = used[kind]; k < cap; k++) {
            const idx = slot * cap + k;
            if (kind === 'sign') s.sign.setMatrixAt(idx, sc.hidden);
            else if (kind === 'tree') s.tree?.setMatrixAt(idx, sc.hidden);
            else if (kind === 'hip') s.hip?.mesh.setMatrixAt(idx, sc.hidden);
            else s.box?.mesh.setMatrixAt(idx, sc.hidden);
          }
        }
        for (const m of [s.box, s.hip]) {
          if (!m) continue;
          m.mesh.instanceMatrix.needsUpdate = true;
          if (m.mesh.instanceColor) m.mesh.instanceColor.needsUpdate = true;
          m.accent.needsUpdate = true;
          m.jitter.needsUpdate = true;
          m.trim.needsUpdate = true;
        }
        for (const m of [s.tree, s.sign]) {
          if (!m) continue;
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
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

    // --- Saison : l'arbre se dépouille ---
    // Ce qui dit l'hiver de loin n'est pas la couleur mais le VOLUME. Une
    // frondaison de juillet est une masse pleine, une ramure de janvier est un
    // dessin — et ça se voit à cinquante mètres, à travers une vitre.
    built.grove.canopy.value = seasonNow().canopy;
    // La neige tient sur une frondaison comme sur une toiture : c'est une
    // surface qui regarde le ciel. Elle ne tient pas sur un tronc.
    built.grove.snow.value = weather.snowCover * 0.85;

    // --- Météo : le mouillé et la neige sur la ville ---
    built.city.wet.value = weather.wet;
    built.city.snow.value = weather.snowCover;

    // --- Nuit : les fenêtres, vitrines et néons s'allument ---
    const w = dayNightWeights(runtime.clockMin / 60);
    const night = Math.min(1, w.night + w.golden * 0.35);
    built.city.night.value = night;
    // Un écran géant existe le jour — il est simplement terne. La nuit, il
    // devient la source lumineuse la plus forte du quartier.
    built.signMat.color.setScalar(0.42 + 1.35 * night);
    // Le sol de la rue se relève lui aussi : il reçoit l'éclairage public et
    // les vitrines, et un asphalte parfaitement noir n'existe pas en ville.
    // Mouillé, il renvoie franchement plus : c'est là que se lisent les néons.
    built.groundMat.emissive
      .copy(STREET_BOUNCE)
      .multiplyScalar(0.07 * night * (1 + 1.5 * weather.wet));
    // La chaussée mouillée fonce de moitié ; la neige la blanchit tout à fait.
    // Les deux cohabitent : une neige qui fond laisse un sol trempé.
    built.groundMat.color
      .setScalar(1 - 0.42 * weather.wet)
      .lerp(SNOW_GROUND, weather.snowCover * 0.9);
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
            {s.box && <primitive object={s.box.mesh} />}
            {s.hip && <primitive object={s.hip.mesh} />}
            {s.tree && <primitive object={s.tree} />}
            {s.sign && <primitive object={s.sign} />}
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
