// L'eau du corridor et la baie de Tokyo.
//
// Le décor n'avait d'eau qu'aux trois traversées de rivière de
// three/Singularities - une nappe de vingt-quatre mètres, posée en travers de
// la voie, et rien d'autre sur trente-quatre kilomètres. Or la Yamanote longe
// la mer : entre Shinagawa et Shimbashi, le trait de côte court à quatre cents
// mètres de la voie, et tout le remblai de Kōnan et de Shibaura est découpé par
// des canaux que le train franchit ou côtoie sans arrêt. C'est le paysage des
// KM 31 à 34 de la bible, et il manquait tout entier.
//
// Deux couches, tirées du même relevé (src/data/water, systems/water) :
//
//   · LE CORRIDOR. Un drap de quadrilatères sur la maille du champ - quarante
//     mètres, quatre cents de part et d'autre de l'axe -, dont l'opacité SUIT
//     LA COUVERTURE de chaque maille. Une maille à moitié mouillée rend une
//     rive à moitié transparente, ce qui vaut mieux qu'un bord en escalier :
//     le relevé ne connaît pas la berge au mètre, et prétendre le contraire se
//     verrait. Le drap est presque toujours vide - un virgule sept pour cent
//     des mailles de la boucle sont mouillées - et il s'efface alors tout à
//     fait, sans coûter un appel de rendu.
//   · LA BAIE. Une bande par côté, dont la rive intérieure est posée à la
//     DISTANCE RELEVÉE du trait de côte, rangée par rangée. Elle n'apparaît que
//     là où la mer est assez près pour se voir - la brume de jour porte à cinq
//     cents mètres - c'est-à-dire de Takanawa Gateway à Hamamatsuchō, et nulle
//     part ailleurs sur la boucle. C'est exactement ce qu'on voit d'un train.
//
// Le drap ne défile pas : ses sommets sont recalculés à chaque image sur une
// grille d'abscisses MONDE, si bien que l'eau ne glisse pas d'un pouce par
// rapport à la ville. C'est l'idiome de three/city/CityRibbon, appliqué à une
// surface au lieu d'un anneau de cellules.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../../systems/runtime';
import { dayNightWeights } from '../../systems/daynight';
import { segEnv } from '../../systems/segmentEnv';
import { plateauRuntime } from '../../systems/plateau';
import { cityRelief, trackElevation } from '../../systems/terrain';
import { shoreOn, waterOn } from '../../systems/water';
import { WATER_COLS, WATER_S_STEP, WATER_X_STEP } from '../../data/water';
import { qualityLevel, usePerf, type Quality } from '../../systems/perf';
import { makeWaterTexture } from '../../textures/procedural';

/** Longueur de la fenêtre, en rangées du champ : mille mètres de large. */
const ROWS = 26;

/** Part de la fenêtre laissée DERRIÈRE le train : on regarde devant. */
const BEHIND = 5;

/**
 * Emprise laissée sèche autour de l'axe (m).
 *
 * La voie passe là, et les traversées de rivière y sont déjà dessinées par
 * three/Singularities avec leurs murs de berge. Deux nappes au même endroit se
 * disputeraient le tampon de profondeur pour rien.
 */
const AXIS_KEEP = 26;

/**
 * Cote de la nappe au-dessus du terrain (m).
 *
 * Le modèle numérique du 国土地理院 porte le plan d'eau lui-même sur un canal :
 * la nappe est donc à la bonne altitude par construction, et ces cinq
 * centimètres ne servent qu'à passer au-dessus de la nappe de rue.
 */
const LIFT = 0.09;

/** Largeur de la bande de baie (m) : au-delà, c'est de la brume. */
const BAY_SPAN = 2400;

/**
 * Au-delà de quelle distance ne dessine-t-on plus la mer (m) ?
 *
 * La brume de jour porte à cinq cent vingt mètres (three/Scene). Un trait de
 * côte à un kilomètre est déjà indistinguable du fond ; à deux, le poser
 * reviendrait à affirmer une géographie qu'on ne peut pas vérifier à l'œil -
 * et le relevé, lui, hésite sur le CÔTÉ dès que la voie tourne, parce que la
 * baie de Tokyo se referme autour de la ligne à Shinagawa comme à Yūrakuchō.
 * On s'arrête donc là où la mer se voit vraiment.
 */
const BAY_MAX = 1100;

/** Le fond dans lequel la nappe se noie la nuit : la lueur de la ville. */
const NIGHT_TONE = new THREE.Color('#2b3138');

/** Le ton de l'eau, le même que celui des chenaux de three/Singularities. */
const TONE = new THREE.Color('#7c8f99');

/** Longueur d'un carreau de texture le long du courant (m). */
const TILE = 26;

function tuning(quality: Quality): boolean {
  // Rien de neuf au dernier palier, comme les trois passes précédentes : deux
  // appels de rendu, c'est peu, mais un téléphone qui rame n'a pas besoin de
  // voir la baie pour reconnaître Hamamatsuchō.
  return quality === 'extraordinary' || qualityLevel(quality) <= 4;
}

export function Waterways() {
  const scene = useThree((s) => s.scene);
  const quality = usePerf((s) => s.quality);
  const on = tuning(quality);

  const root = useRef<THREE.Group>(null);

  const built = useMemo(() => {
    if (!on) return null;
    const tex = makeWaterTexture();
    tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: '#ffffff',
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      roughness: 0.34,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    // --- Le drap du corridor : une grille (ROWS + 1) × WATER_COLS ---
    const cw = WATER_COLS;
    const cr = ROWS + 1;
    const cPos = new Float32Array(cr * cw * 3);
    const cUv = new Float32Array(cr * cw * 2);
    const cCol = new Float32Array(cr * cw * 4);
    const cIdx = new Uint16Array(ROWS * (cw - 1) * 6);
    for (let r = 0, k = 0; r < ROWS; r++) {
      for (let c = 0; c + 1 < cw; c++, k += 6) {
        const a = r * cw + c;
        cIdx.set([a, a + 1, a + cw + 1, a, a + cw + 1, a + cw], k);
      }
    }
    const corridor = makeMesh('eau du corridor', cPos, cUv, cCol, cIdx, mat);

    // --- La baie : deux bandes, une par côté, deux sommets par rangée ---
    const bPos = new Float32Array(2 * cr * 2 * 3);
    const bUv = new Float32Array(2 * cr * 2 * 2);
    const bCol = new Float32Array(2 * cr * 2 * 4);
    const bIdx = new Uint16Array(2 * ROWS * 6);
    for (let s = 0, k = 0; s < 2; s++) {
      const base = s * cr * 2;
      for (let r = 0; r < ROWS; r++, k += 6) {
        const a = base + r * 2;
        bIdx.set([a, a + 1, a + 3, a, a + 3, a + 2], k);
      }
    }
    const bay = makeMesh('baie de Tokyo', bPos, bUv, bCol, bIdx, mat);

    return { tex, mat, corridor, bay, cPos, cUv, cCol, bPos, bUv, bCol };
  }, [on]);

  useEffect(() => {
    if (!built) return;
    return () => {
      built.corridor.geometry.dispose();
      built.bay.geometry.dispose();
      built.mat.dispose();
      built.tex.dispose();
    };
  }, [built]);

  const scratch = useMemo(() => ({ tone: new THREE.Color(), haze: new THREE.Color('#d6e8f2') }), []);

  useFrame(() => {
    if (!built) return;
    // Le prototype PLATEAU pose une ville relevée sur son propre terrain : un
    // canal procédural y couperait une rue réelle. Même règle que le reste du
    // ruban.
    const show = plateauRuntime.coverage < 0.5;
    if (root.current) {
      root.current.visible = show;
      root.current.position.y = segEnv.cityY;
    }
    if (!show) return;

    const sc = scratch;
    const w = dayNightWeights(runtime.clockMin / 60);
    const night = Math.min(1, w.night + w.golden * 0.45);
    // L'eau ne s'éteint pas, elle prend la couleur du ciel - et la brume de la
    // scène EST cette couleur. Le raisonnement est celui des chenaux de
    // three/Singularities, et il vaut d'autant plus ici que la baie est loin.
    if (scene.fog instanceof THREE.Fog) sc.haze.copy(scene.fog.color);
    sc.tone.copy(TONE).lerp(NIGHT_TONE, 0.78 * night).lerp(sc.haze, 0.1);
    built.mat.emissive.setRGB(0.06, 0.05, 0.038).multiplyScalar(night);

    // La grille d'abscisses est celle du relevé, calée sur le MONDE : la nappe
    // ne glisse donc jamais par rapport à la ville, quelle que soit la vitesse.
    const base = Math.floor(runtime.distance / WATER_S_STEP - BEHIND) * WATER_S_STEP;
    const axis = (WATER_COLS - 1) / 2;

    let wet = false;
    for (let r = 0; r <= ROWS; r++) {
      const s = base + r * WATER_S_STEP;
      const z = runtime.distance - s;
      for (let c = 0; c < WATER_COLS; c++) {
        // Le champ compte ses colonnes à GAUCHE du sens des index croissants ;
        // la scène compte son x à droite du train. `waterOn` fait la bascule à
        // partir des coordonnées du ruban - une distance et un côté.
        const x = (c - axis) * WATER_X_STEP;
        const side: 1 | -1 = x >= 0 ? 1 : -1;
        const cover = Math.abs(x) < AXIS_KEEP ? 0 : waterOn(s, Math.abs(x), side);
        const i = r * WATER_COLS + c;
        built.cPos[i * 3] = x;
        built.cPos[i * 3 + 1] = cityRelief(s, Math.abs(x), side) + LIFT;
        built.cPos[i * 3 + 2] = z;
        built.cUv[i * 2] = s / TILE;
        built.cUv[i * 2 + 1] = x / (TILE / 4);
        built.cCol[i * 4] = sc.tone.r;
        built.cCol[i * 4 + 1] = sc.tone.g;
        built.cCol[i * 4 + 2] = sc.tone.b;
        // La couverture d'une maille n'est pas son opacité : une maille à un
        // tiers mouillée est une rive, pas une flaque translucide. On raidit
        // donc la courbe, sans jamais la rendre franche - c'est le seul aveu
        // honnête qu'on puisse faire d'une maille de quarante mètres.
        const a = Math.max(0, Math.min(1, (cover - 0.12) * 2.2));
        built.cCol[i * 4 + 3] = a;
        if (a > 0.02) wet = true;
      }
    }
    built.corridor.visible = wet;
    if (wet) {
      const g = built.corridor.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.uv.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    }

    // --- La baie ---
    // Le niveau de la mer est zéro orthométrique, et tout le décor se mesure
    // par rapport au sol sous la voie : la nappe est donc À LA COTE DE LA VOIE
    // près, c'est-à-dire trois mètres plus bas à Hamamatsuchō. Ce décrochement
    // se lit - c'est le quai de béton du remblai.
    const sea = -trackElevation();
    let seen = false;
    for (let sd = 0; sd < 2; sd++) {
      const side: 1 | -1 = sd === 0 ? 1 : -1;
      for (let r = 0; r <= ROWS; r++) {
        const s = base + r * WATER_S_STEP;
        const z = runtime.distance - s;
        const d = shoreOn(s, side);
        const open = d > 0 && d <= BAY_MAX;
        const inner = open ? d : 0;
        const i = (sd * (ROWS + 1) + r) * 2;
        for (let k = 0; k < 2; k++) {
          const x = side * (inner + (k === 1 ? BAY_SPAN : 0));
          built.bPos[(i + k) * 3] = x;
          built.bPos[(i + k) * 3 + 1] = sea;
          built.bPos[(i + k) * 3 + 2] = z;
          built.bUv[(i + k) * 2] = s / TILE;
          built.bUv[(i + k) * 2 + 1] = x / (TILE / 4);
          built.bCol[(i + k) * 4] = sc.tone.r;
          built.bCol[(i + k) * 4 + 1] = sc.tone.g;
          built.bCol[(i + k) * 4 + 2] = sc.tone.b;
          // La mer s'efface là où le relevé la perd de vue, plutôt que de
          // s'arrêter net sur une ligne droite qui n'existe pas.
          built.bCol[(i + k) * 4 + 3] = open ? Math.min(1, (BAY_MAX - d) / 260) : 0;
        }
        if (open) seen = true;
      }
    }
    built.bay.visible = seen;
    if (seen) {
      const g = built.bay.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.uv.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    }
  });

  if (!built) return null;
  return (
    <group ref={root}>
      <primitive object={built.corridor} />
      <primitive object={built.bay} />
    </group>
  );
}

function makeMesh(
  name: string,
  pos: Float32Array,
  uv: Float32Array,
  col: Float32Array,
  idx: Uint16Array,
  mat: THREE.Material,
): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // Quatre composantes : la quatrième porte l'opacité, et c'est elle qui fait
  // la rive. Three lit le canal alpha d'un attribut `color` en itemSize 4.
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.userData.cityFamily = name;
  mesh.userData.noShadow = true;
  // Les sommets sont réécrits à chaque image : la sphère englobante calculée à
  // la construction ne veut rien dire, et la recalculer coûterait plus que les
  // mille triangles qu'elle prétend écarter.
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}
