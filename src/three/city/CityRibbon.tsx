// Le ruban urbain : la ville en volume, posée dans le monde, que le train
// dépasse. Les corps de bâtiment et leurs volumes secondaires (acrotères,
// édicules de toiture, chaussées) sont découpés en cellules de 40 m (voir
// systems/cityField) tenues dans un anneau glissant.
//
// DEUX MAILLES, DEUX ANNEAUX. Le bâti proche tient les soixante-six premiers
// mètres à la maille de 40 m ; l'arrière-pays va jusqu'à deux cent soixante, à
// la maille de 120 m, dans un maillage à lui. Les deux partagent la même
// origine - celle de l'anneau proche - et vivent donc sous le même groupe, ce
// qui leur donne le même recul, la même élévation de tronçon et le même
// écartement de gare.
//
// Le groupe entier recule d'un `runtime.distance` : les instances gardent donc
// une abscisse FIXE et ne sont réécrites qu'au recyclage d'une cellule, soit
// une fois toutes les ~1,6 s à vitesse de croisière. Rien ne bouge par rapport
// au monde, tout bouge par rapport au train - c'est la seule façon d'obtenir
// une parallaxe juste entre le bord de voie, l'îlot et le fond.
//
// TROIS DÉPLACEMENTS D'ENSEMBLE, dans cet ordre de nidification :
//   · l'élévation du tronçon (segEnv.cityY) - la ville descend de sept mètres
//     sous un viaduc, remonte sur la crête des murs en tranchée ;
//   · le recul du monde en z ;
//   · l'écartement latéral, par côté : celui de la gare (stationOcclusion) et
//     celui du faisceau de voies d'un corridor (segEnv.citySetback).
//
// Le sol urbain vit ici aussi, et non plus dans Wayside : il porte la même
// élévation que la ville, et il est fendu en deux nappes qui laissent
// l'emprise de la voie libre - une nappe unique passerait au-dessus du train
// dès qu'elle monte sur les murs d'une tranchée.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makeGroundStrip, underStation } from '../groundStrip';
import { runtime } from '../../systems/runtime';
import { dayNightWeights } from '../../systems/daynight';
import { segEnv } from '../../systems/segmentEnv';
import { groundPush, sidePush, stationOcclusion } from '../../systems/stationOcclusion';
import { plateauRuntime } from '../../systems/plateau';
import { useStore } from '../../store';
import { qualityLevel, usePerf, type Quality } from '../../systems/perf';
import {
  CELL_CAPACITY,
  CELL_LEN,
  FAR_CELL_CAPACITY,
  FAR_CELL_LEN,
  PROP_CAPS,
  type PropKind,
  buildCell,
  buildCellProps,
  buildFarCell,
  clearing,
  makeCellBuffer,
  makePropBuffer,
  cityAnchor,
  updateCityAnchor,
} from '../../systems/cityField';
import { cityGround, trackElevation, terrainEnabled, updateTerrain } from '../../systems/terrain';
import { singularity } from '../../systems/singularity';
import { GROUND_TILE, makeCityGroundTexture, makeSignageTexture } from '../../textures/city';
import { makeCityMaterial } from './cityMaterial';
import { makeGroveGeometry, makeGroveMaterial, makeHipRoofGeometry } from './cityProps';
import {
  makeAcBankGeometry,
  makeMastGeometry,
  makeObstacleLightGeometry,
  makeRoofRailGeometry,
  makeWaterTankGeometry,
} from './roofKit';
import { seasonNow } from '../../systems/season';
import { weather } from '../../systems/weather';

/** Rebond de l'éclairage public sur le sol, la nuit. */
const STREET_BOUNCE = new THREE.Color('#ffb877');
/** Rue enneigée : le gris bleuté d'une neige de ville, jamais du blanc pur. */
const SNOW_GROUND = new THREE.Color('#dfe4ea');

/** Axe de rotation des enseignes, qui regardent toutes la voie. */
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** Familles de volumes secondaires, dans l'ordre d'escamotage. */
/**
 * Familles rendues avec le MATÉRIAU DE VILLE, drapeau « volume nu » : elles
 * partagent le chemin d'écriture, seule la géométrie change.
 */
const SOLID_KINDS = ['box', 'hip', 'tank', 'ac', 'mast', 'rail'] as const;
type SolidKind = (typeof SOLID_KINDS)[number];

const PROP_KINDS: PropKind[] = [...SOLID_KINDS, 'tree', 'sign', 'beacon'];

/** Emprise laissée libre de part et d'autre de l'axe : ballast et voie. */
const GROUND_INNER = 5;
/**
 * Largeur d'une nappe de sol urbain (m) : au-delà du dernier rang bâti, et
 * au-delà de la portée de la brume. Sa rive extérieure doit être NOYÉE, sinon
 * on voit la rue s'arrêter net sur du ciel - c'est ce qui est arrivé le jour
 * où l'arrière-pays a repoussé le bâti à deux cent soixante mètres.
 */
const GROUND_SPAN = 560;
/** Longueur des nappes (m) : la vue en biais vers le fond du wagon porte loin. */
const GROUND_LEN = 1200;
/**
 * Découpe en travers des nappes de rue.
 *
 * Une nappe plate n'avait besoin que de ses deux rives. Depuis que la rue suit
 * le relief du 国土地理院, il lui faut des sommets pour le suivre : huit
 * tronçons, soit soixante-dix mètres chacun, ce qui suffit à une falaise qui
 * s'étale sur cent. Au-delà on paierait un parcours de sommets par image pour
 * une pente déjà lisse.
 */
const GROUND_WIDTH_SEGMENTS = 8;
/**
 * De combien un bâtiment s'enfonce dans son terrain (m).
 *
 * La nappe de rue est une grille de quelques dizaines de sommets, le relief est
 * lu à l'emplacement exact du bâtiment : les deux ne tombent pas d'accord au
 * décimètre. Un pied enterré ne se voit jamais depuis un train ; un pied en
 * l'air, si.
 */
const SKIRT = 1.5;

/**
 * Longueur des deux anneaux et allègement des rangs par palier de qualité.
 *
 * L'anneau proche ne descend jamais sous 440 m (± 220 m) : c'est la portée de
 * la brume de jour, en deçà on verrait la ville apparaître à vue. Ce qui
 * s'allège, c'est la DENSITÉ de chaque rang, pas l'étendue.
 *
 * L'arrière-pays (`farCells`, cellules de 120 m) suit la même règle à son
 * échelle : il doit dépasser la brume, sinon la ligne de faîte s'ouvre devant
 * le train.
 */
function tuning(quality: Quality): {
  cells: number;
  farCells: number;
  rankScale: number;
  farScale: number;
  props: boolean;
  signs: boolean;
} {
  // Mode Extraordinaire : la ville se remplit. `rankScale` au-dessus de 1 ne
  // pousse pas l'anneau plus loin - la brume l'arrête de toute façon - il
  // resserre les rangs jusqu'au plafond de la cellule, là où le regard porte.
  // C'est la densité de Tokyo, pas son étendue, qui manquait.
  if (quality === 'extraordinary')
    return { cells: 13, farCells: 11, rankScale: 1.3, farScale: 1.25, props: true, signs: true };
  const level = qualityLevel(quality);
  if (level <= 1)
    return { cells: 13, farCells: 11, rankScale: 1, farScale: 1, props: true, signs: true };
  if (level === 2)
    return { cells: 12, farCells: 9, rankScale: 0.8, farScale: 0.85, props: true, signs: true };
  if (level === 3)
    return { cells: 11, farCells: 7, rankScale: 0.6, farScale: 0.7, props: true, signs: true };
  // Aux deux derniers paliers, acrotères, croupes et bosquets tombent - mais
  // pas les enseignes : un quad par bâtiment, et c'est tout ce qui reste de
  // reconnaissable à Akihabara ou Shin-Ōkubo une fois la nuit tombée.
  // L'arrière-pays reste, réduit : c'est un seul maillage par côté, et c'est
  // lui qui donne au fond une ligne de faîte au lieu d'un aplat de brume.
  return { cells: 11, farCells: 5, rankScale: 0.4, farScale: 0.55, props: false, signs: true };
}

export function CityRibbon() {
  const quality = usePerf((s) => s.quality);
  const { cells, farCells, rankScale, farScale, props, signs } = tuning(quality);

  const yRoot = useRef<THREE.Group>(null);
  const zRoot = useRef<THREE.Group>(null);
  const sideRoots = useRef<(THREE.Group | null)[]>([]);
  // Les deux nappes de rue se dérobent sous le quai : elles sont donc
  // découpées en tronçons plutôt que d'un seul tenant (voir three/groundStrip).
  const grounds = useMemo(
    () => [1, -1].map(() => makeGroundStrip(GROUND_SPAN, GROUND_LEN, GROUND_WIDTH_SEGMENTS)),
    [],
  );
  useEffect(() => () => grounds.forEach((g) => g.dispose()), [grounds]);

  const built = useMemo(() => {
    const city = makeCityMaterial();
    const bodyPer = cells * CELL_CAPACITY;

    // `family` n'est là que pour la sonde : elle permet de demander à la scène
    // ce qu'elle rend vraiment - combien d'instances, combien d'escamotées,
    // quelle part de coursives - au lieu de le déduire du générateur, qui est
    // justement ce dont on doute quand une ville ne montre pas ce qu'on croit.
    const mkMesh = (count: number, family: string, geometry?: THREE.BufferGeometry) => {
      // Une géométrie par maillage : les attributs d'instance vivent dessus,
      // deux InstancedMesh ne peuvent donc pas la partager.
      const geo = geometry ?? new THREE.BoxGeometry(1, 1, 1);
      const accent = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      const jitter = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
      const trim = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
      // Les dimensions de l'instance, écrites en clair. Le nuanceur GLSL les
      // relit de `instanceMatrix` ; le nuanceur à nœuds du mode Extraordinaire
      // n'a pas accès à cette matrice et lit cet attribut. Trois flottants par
      // instance : à côté des seize de la matrice, ce n'est rien, et ça évite
      // deux chemins de code dans la boucle de remplissage.
      const scale = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      // Famille de façade : 0 = façade courante à meneaux, 1 = coursive de
      // logement collectif. Un seul nombre plutôt qu'un sac de bits, parce que
      // c'est bien un choix de FAMILLE, et qu'il y en aura peut-être une autre.
      const facade = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
      accent.setUsage(THREE.DynamicDrawUsage);
      jitter.setUsage(THREE.DynamicDrawUsage);
      trim.setUsage(THREE.DynamicDrawUsage);
      scale.setUsage(THREE.DynamicDrawUsage);
      facade.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAccent', accent);
      geo.setAttribute('aJitter', jitter);
      geo.setAttribute('aTrim', trim);
      geo.setAttribute('aScale', scale);
      geo.setAttribute('aFacade', facade);
      const mesh = new THREE.InstancedMesh(geo, city.material, count);
      mesh.userData.cityFamily = family;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // L'anneau couvre ± 220 m de part et d'autre : la sphère englobante de la
      // boîte unité ne veut rien dire ici, on désactive le tri par frustum.
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return { geo, mesh, accent, jitter, trim, scale, facade };
    };

    // Bosquets : matériau propre, qui garde le tronc brun quand la frondaison
    // rougit et qui dépouille l'arbre l'hiver. Il ne passe pas par le matériau
    // de ville - un feuillage n'a ni fenêtres ni devanture.
    const grove = makeGroveMaterial();
    const groveMat = grove.material;
    // Enseignes : non éclairées, teintées par instance, dont le NIVEAU suit
    // l'heure - le panneau est terne le jour et éclate la nuit.
    const signTex = makeSignageTexture();
    const signMat = new THREE.MeshBasicMaterial({
      map: signTex,
      toneMapped: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    const signGeo = new THREE.PlaneGeometry(1, 1);
    const groveGeo = makeGroveGeometry();
    // Une géométrie par famille solide. La boîte unité sert de défaut : c'est
    // l'acrotère, l'édicule et la chaussée.
    const solidGeo: Record<SolidKind, THREE.BufferGeometry | undefined> = {
      box: undefined,
      hip: makeHipRoofGeometry(),
      tank: makeWaterTankGeometry(),
      ac: makeAcBankGeometry(),
      mast: makeMastGeometry(),
      rail: makeRoofRailGeometry(),
    };
    // Feu d'obstacle : ni éclairé, ni teinté par la scène, et INVISIBLE LE
    // JOUR - un maillage caché ne coûte pas d'appel de rendu, ce qui rend le
    // feu gratuit sur les deux tiers du cycle horaire.
    const beaconMat = new THREE.MeshBasicMaterial({ toneMapped: false, fog: true });
    const beaconGeo = makeObstacleLightGeometry();

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
      body: mkMesh(bodyPer, 'corps'),
      // L'arrière-pays : même matériau, même programme, un maillage de plus par
      // côté. Il n'a ni acrotère, ni enseigne, ni bosquet - à deux cents mètres
      // on ne lit qu'une masse et, la nuit, des fenêtres.
      far: mkMesh(farCells * FAR_CELL_CAPACITY, 'arrière-pays'),
      // Acrotères, édicules, chaussées, croupes, réservoirs, condenseurs, mâts
      // et garde-corps : tous par le matériau de ville, drapeau « nu ».
      solid: props
        ? (Object.fromEntries(
            SOLID_KINDS.map((k) => [k, mkMesh(cells * PROP_CAPS[k], k, solidGeo[k]?.clone())]),
          ) as Record<SolidKind, ReturnType<typeof mkMesh>>)
        : null,
      tree: props ? mkPlain(cells * PROP_CAPS.tree, groveGeo, groveMat) : null,
      sign: signs ? mkPlain(cells * PROP_CAPS.sign, signGeo, signMat) : null,
      beacon: props ? mkPlain(cells * PROP_CAPS.beacon, beaconGeo, beaconMat) : null,
    }));

    const groundTex = makeCityGroundTexture();
    groundTex.repeat.set(GROUND_SPAN / GROUND_TILE, GROUND_LEN / GROUND_TILE);
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex, fog: true });

    return {
      city,
      sides,
      groundTex,
      groundMat,
      grove,
      groveGeo,
      signMat,
      signTex,
      signGeo,
      solidGeo,
      beaconGeo,
      beaconMat,
    };
  }, [cells, farCells, props, signs]);

  useEffect(
    () => () => {
      for (const s of built.sides) {
        s.body.mesh.dispose();
        s.body.geo.dispose();
        s.far.mesh.dispose();
        s.far.geo.dispose();
        if (s.solid) {
          for (const k of SOLID_KINDS) {
            s.solid[k].mesh.dispose();
            s.solid[k].geo.dispose();
          }
        }
        s.tree?.dispose();
        s.sign?.dispose();
        s.beacon?.dispose();
      }
      built.groveGeo.dispose();
      built.grove.dispose();
      built.signGeo.dispose();
      built.signTex.dispose();
      built.signMat.dispose();
      for (const k of SOLID_KINDS) built.solidGeo[k]?.dispose();
      built.beaconGeo.dispose();
      built.beaconMat.dispose();
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
      farBuf: makeCellBuffer(FAR_CELL_CAPACITY),
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

  const ring = useRef({ first: 0, origin: 0, ready: false, farFirst: 0, epoch: -1 });

  useFrame(() => {
    const { index, loopDirection } = useStore.getState();
    updateCityAnchor(index, segEnv.p, loopDirection);
    // Le relief se recale sur l'ancre des quartiers, puis sur la position du
    // train : tout le ruban lira la même référence pendant cette image, y
    // compris les cellules réécrites en cours de route.
    updateTerrain(runtime.distance, cityAnchor);

    const st = ring.current;
    const sc = scratch;

    /**
     * Écrit `n` corps de bâtiment dans un maillage, à partir de l'emplacement
     * `base`, et escamote le reste de la tranche. Les deux anneaux - le bâti
     * proche et l'arrière-pays - passent par là : même matériau, mêmes
     * attributs, seules la maille et la profondeur changent.
     */
    const writeBodies = (
      t: (typeof built.sides)[number]['body'],
      side: 1 | -1,
      buf: typeof sc.buf,
      base: number,
      cap: number,
      n: number,
    ) => {
      for (let i = 0; i < cap; i++) {
        const idx = base + i;
        const b = i < n ? buf[i] : null;
        // Un bosquet REMPLACE le bâtiment : son emplacement reste vide.
        if (!b || b.grove) {
          t.mesh.setMatrixAt(idx, sc.hidden);
          continue;
        }
        // Le pied du sujet suit le relief du 国土地理院, et s'enfonce d'un
        // mètre et demi dedans. Ce n'est pas de la coquetterie : la nappe de
        // rue est une grille de quelques dizaines de sommets, le relief est lu
        // au centimètre à l'emplacement exact du bâtiment, et les deux ne
        // tombent pas d'accord au décimètre près. Un pied enterré ne se voit
        // jamais depuis un train ; un pied en l'air, si.
        sc.pos.set(side * b.x, b.y - SKIRT + (b.h + SKIRT) / 2, st.origin - b.s);
        sc.scl.set(b.d, b.h + SKIRT, b.w);
        // La trame du quartier : une rotation autour de Y de -yaw, la MÊME
        // des deux côtés de la voie. Le côté -x n'est pas un miroir du côté
        // +x - une rue qui franchit le remblai continue du même angle.
        sc.rot.setFromAxisAngle(Y_AXIS, -b.yaw);
        sc.mtx.compose(sc.pos, sc.rot, sc.scl);
        t.mesh.setMatrixAt(idx, sc.mtx);
        t.scale.setXYZ(idx, sc.scl.x, sc.scl.y, sc.scl.z);
        sc.color.set(b.facade).multiplyScalar(b.shade);
        t.mesh.setColorAt(idx, sc.color);
        sc.accent.set(b.accent);
        t.accent.setXYZ(idx, sc.accent.r, sc.accent.g, sc.accent.b);
        t.jitter.setXY(idx, b.jx, b.jy);
        t.trim.setXYZW(idx, b.glow, b.socle, 0, b.warm);
        t.facade.setX(idx, b.balcony ? 1 : 0);
      }
      t.mesh.instanceMatrix.needsUpdate = true;
      if (t.mesh.instanceColor) t.mesh.instanceColor.needsUpdate = true;
      t.accent.needsUpdate = true;
      t.jitter.needsUpdate = true;
      t.trim.needsUpdate = true;
      t.scale.needsUpdate = true;
      t.facade.needsUpdate = true;
    };

    const writeFarCell = (cell: number) => {
      const slot = ((cell % farCells) + farCells) % farCells;
      for (const s of built.sides) {
        const n = buildFarCell(cell, s.side, sc.farBuf, farScale);
        writeBodies(s.far, s.side, sc.farBuf, slot * FAR_CELL_CAPACITY, FAR_CELL_CAPACITY, n);
      }
    };

    const writeCell = (cell: number) => {
      const slot = ((cell % cells) + cells) % cells;
      for (const s of built.sides) {
        const n = buildCell(cell, s.side, sc.buf, rankScale);
        writeBodies(s.body, s.side, sc.buf, slot * CELL_CAPACITY, CELL_CAPACITY, n);

        // --- Acrotères, croupes, toitures, bosquets, enseignes ---
        if (!s.sign) continue;
        const np = buildCellProps(cell, s.side, sc.buf, n, sc.propBuf);
        // Un curseur par famille : le générateur les entremêle dans un seul
        // tampon, le rendu les répartit dans autant de maillages.
        const used = sc.used;
        for (const kind of PROP_KINDS) used[kind] = 0;
        for (let i = 0; i < np; i++) {
          const p = sc.propBuf[i];
          const k = used[p.kind];
          if (k >= PROP_CAPS[p.kind]) continue;
          used[p.kind] = k + 1;
          const idx = slot * PROP_CAPS[p.kind] + k;

          if (p.kind !== 'sign' && (!s.solid || !s.tree || !s.beacon)) continue;

          if (p.kind === 'sign') {
            // Panneau plaqué sur la face qui regarde la voie, donc tourné vers
            // l'axe : un quart de tour, dans le sens du côté - plus la trame du
            // bâtiment qui le porte, sans quoi il se décollerait de sa façade.
            sc.pos.set(s.side * p.x, p.base + p.y + p.h / 2, st.origin - p.s);
            sc.rot.setFromAxisAngle(
              Y_AXIS,
              (s.side === 1 ? -Math.PI / 2 : Math.PI / 2) - p.yaw,
            );
            sc.scl.set(p.w, p.h, 1);
            sc.mtx.compose(sc.pos, sc.rot, sc.scl);
            s.sign.setMatrixAt(idx, sc.mtx);
            sc.color.set(p.tone);
            s.sign.setColorAt(idx, sc.color);
            continue;
          }

          // Bosquets, croupes et accessoires de toiture sont écrits dans un
          // cube unité POSÉ PAR LA BASE ; les volumes en boîte, eux, sont
          // centrés, et le feu d'obstacle est une bille centrée sur sa cote.
          const baseY = p.base + (p.kind === 'box' ? p.y + p.h / 2 : p.y);
          sc.pos.set(s.side * p.x, baseY, st.origin - p.s);
          sc.rot.setFromAxisAngle(Y_AXIS, -p.yaw);

          if (p.kind === 'beacon' && s.beacon) {
            sc.scl.set(p.d, p.h, p.w);
            sc.mtx.compose(sc.pos, sc.rot, sc.scl);
            s.beacon.setMatrixAt(idx, sc.mtx);
            sc.color.set(p.tone);
            s.beacon.setColorAt(idx, sc.color);
            continue;
          }

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
          const target = s.solid?.[p.kind as SolidKind];
          if (!target) continue;
          target.mesh.setMatrixAt(idx, sc.mtx);
          sc.color.set(p.tone);
          target.mesh.setColorAt(idx, sc.color);
          target.accent.setXYZ(idx, 1, 1, 1);
          target.jitter.setXY(idx, 0, 0);
          target.trim.setXYZW(idx, 0, 0, 1, 1);
          target.scale.setXYZ(idx, sc.scl.x, sc.scl.y, sc.scl.z);
          target.facade.setX(idx, 0);
        }
        // Escamoter les emplacements non pourvus de la cellule.
        for (const kind of PROP_KINDS) {
          const cap = PROP_CAPS[kind];
          for (let k = used[kind]; k < cap; k++) {
            const idx = slot * cap + k;
            if (kind === 'sign') s.sign.setMatrixAt(idx, sc.hidden);
            else if (kind === 'tree') s.tree?.setMatrixAt(idx, sc.hidden);
            else if (kind === 'beacon') s.beacon?.setMatrixAt(idx, sc.hidden);
            else s.solid?.[kind as SolidKind].mesh.setMatrixAt(idx, sc.hidden);
          }
        }
        if (s.solid) {
          for (const kind of SOLID_KINDS) {
            const m = s.solid[kind];
            m.mesh.instanceMatrix.needsUpdate = true;
            if (m.mesh.instanceColor) m.mesh.instanceColor.needsUpdate = true;
            m.accent.needsUpdate = true;
            m.jitter.needsUpdate = true;
            m.trim.needsUpdate = true;
            m.scale.needsUpdate = true;
            m.facade.needsUpdate = true;
          }
        }
        for (const m of [s.tree, s.sign, s.beacon]) {
          if (!m) continue;
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
      }
    };

    // --- Anneaux glissants : une cellule sort derrière, une entre devant ---
    // Les deux mailles partagent la MÊME origine, celle de l'anneau proche :
    // c'est ce qui leur permet de vivre sous le même groupe, donc de reculer
    // d'un seul `runtime.distance`. Une ré-ancrage rebâtit forcément les deux.
    const want = Math.floor(runtime.distance / CELL_LEN) - (cells >> 1);
    const farWant = Math.floor(runtime.distance / FAR_CELL_LEN) - (farCells >> 1);
    const drift = runtime.distance - st.origin;
    if (!st.ready || Math.abs(want - st.first) > cells || drift < 0 || drift > 12000) {
      // Reprise à froid, saut de position, ou dérive numérique : on rebâtit
      // l'anneau entier et on ré-ancre l'origine (une poignée de fois par heure,
      // pour quelques centaines de matrices - invisible).
      st.origin = Math.floor(runtime.distance / CELL_LEN) * CELL_LEN;
      st.first = want;
      st.farFirst = farWant;
      for (let k = 0; k < cells; k++) writeCell(want + k);
      for (let k = 0; k < farCells; k++) writeFarCell(farWant + k);
      st.ready = true;
    } else {
      while (st.first < want) {
        writeCell(st.first + cells);
        st.first++;
      }
      while (st.farFirst < farWant) {
        writeFarCell(st.farFirst + farCells);
        st.farFirst++;
      }
    }

    // --- Une trouée vient d'être ancrée : on rebâtit ce qu'elle recouvre ---
    //
    // L'anneau porte deux cent vingt mètres d'avance, et la Kanda tombe à cent
    // soixante-dix mètres de la gare de Kanda : les cellules de la rivière ont
    // donc été engendrées AVANT qu'on sache qu'une rivière allait passer là.
    // Elles sont réécrites sur place, une poignée de fois par tour.
    if (st.epoch !== singularity.epoch) {
      st.epoch = singularity.epoch;
      if (clearing.half > 0) {
        const c0 = Math.floor((clearing.s - clearing.half) / CELL_LEN);
        const c1 = Math.floor((clearing.s + clearing.half) / CELL_LEN);
        for (let c = c0; c <= c1; c++) {
          if (c >= st.first && c < st.first + cells) writeCell(c);
        }
      }
    }

    // --- Élévation du tronçon, recul du monde, écartements latéraux ---
    // Le bâti porte une altitude ORTHOMÉTRIQUE figée à l'écriture de la
    // cellule. On ramène le datum « sol sous le train = 0 » ici, à chaque
    // image : sans quoi la rue (relevée en direct) glisserait sous des pieds
    // restés à la cote d'il y a deux cents mètres - et les immeubles
    // flotterait dès que la voie grimpe, comme à Nippori.
    if (yRoot.current) {
      yRoot.current.position.y =
        segEnv.cityY - (terrainEnabled() ? trackElevation() : 0);
    }
    if (zRoot.current) {
      zRoot.current.position.z = runtime.distance - st.origin;
      // Le prototype PLATEAU pose une ville RÉELLE sur son tronçon : le ruban
      // procédural s'efface alors, sinon deux villes se superposeraient. Le sol
      // urbain, lui, reste - les données PLATEAU ne portent aucun terrain. La
      // bascule a lieu au départ d'une gare, masquée par le quai, exactement
      // comme le changement de type de tronçon.
      zRoot.current.visible = plateauRuntime.coverage < 0.5;
    }
    for (let i = 0; i < built.sides.length; i++) {
      const root = sideRoots.current[i];
      const side = built.sides[i].side;
      if (root) root.position.x = side * (sidePush(side) + segEnv.citySetback);
    }

    // --- Sol défilant, dégagé de la dalle du quai quand il y en a une ---
    // La nappe passe SOUS le quai, un mètre plus bas que sa dalle. Le quai la
    // masque partout, sauf au droit d'une trémie d'escalier, dont la volée
    // descend plus bas qu'elle : voir groundPush (systems/stationOcclusion).
    // Seule la rive INTÉRIEURE bouge, et seulement au droit du quai. La nappe
    // du côté −x est la même géométrie, simplement posée en négatif : sa rive
    // intérieure est donc son abscisse locale HAUTE, et elle s'écarte dans
    // l'autre sens.
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const push = groundPush(side, GROUND_INNER);
      const inner = (side * -GROUND_SPAN) / 2;
      grounds[i].update((z, x) =>
        push === 0 || x !== inner
          ? x
          : x + side * push * underStation(z, stationOcclusion.z0, stationOcclusion.z1),
      );
      // La rue épouse le relief. Sa cote est ORTHOMÉTRIQUE, comme le bâti :
      // le parent `yRoot` soustrait déjà `trackElevation()`, donc on n'y
      // retranche plus `hereY` ici - sinon on compterait deux fois.
      const centre = GROUND_INNER + GROUND_SPAN / 2;
      grounds[i].lift((z, x) =>
        terrainEnabled()
          ? cityGround(runtime.distance - z, centre + side * x, side)
          : 0,
      );
    }
    built.groundTex.offset.y = runtime.distance / GROUND_TILE;

    // --- Saison : l'arbre se dépouille ---
    // Ce qui dit l'hiver de loin n'est pas la couleur mais le VOLUME. Une
    // frondaison de juillet est une masse pleine, une ramure de janvier est un
    // dessin - et ça se voit à cinquante mètres, à travers une vitre.
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
    // Un écran géant existe le jour - il est simplement terne. La nuit, il
    // devient la source lumineuse la plus forte du quartier.
    built.signMat.color.setScalar(0.42 + 1.35 * night);
    // Les feux d'obstacle ne s'allument pas : ils APPARAISSENT. Un maillage
    // caché ne coûte pas d'appel de rendu, et une bille rouge posée sur un mât
    // en pleine lumière ne se verrait de toute façon pas.
    for (const s of built.sides) if (s.beacon) s.beacon.visible = night > 0.18;
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
            <primitive object={s.far.mesh} />
            {s.solid &&
              SOLID_KINDS.map((k) => <primitive key={k} object={s.solid![k].mesh} />)}
            {s.tree && <primitive object={s.tree} />}
            {s.sign && <primitive object={s.sign} />}
            {s.beacon && <primitive object={s.beacon} />}
          </group>
        ))}
      </group>

      {/* Sol urbain : deux nappes, l'emprise de la voie laissée libre. */}
      {([1, -1] as const).map((side, i) => (
        <mesh
          key={`ground${side}`}
          position={[side * (GROUND_INNER + GROUND_SPAN / 2), -0.04, 0]}
          geometry={grounds[i].geometry}
          material={built.groundMat}
        />
      ))}
    </group>
  );
}
