// Ciel de Tokyo et ligne d'horizon, en une seule passe posée À L'INFINI.
//
// Ce que ça remplace, et pourquoi. Le ciel était fait de trois cylindres
// transparents fondus, et la ville lointaine de deux plans latéraux. Tant que
// TOUT le décor était transparent et n'écrivait pas la profondeur, l'ordre de
// rendu suffisait. Le ruban urbain (three/city/CityRibbon) est opaque et écrit
// la profondeur : un ciel transparent posé à 78 m repasserait par-dessus les
// immeubles situés à deux cents mètres dans l'axe de la voie - là précisément
// où l'on regarde en se plaçant au bout du wagon.
//
// La réponse est celle d'une boîte à ciel : un seul cylindre OPAQUE, test de
// profondeur désactivé, dessiné le premier (renderOrder très négatif). Tout le
// reste peint par-dessus, quelle que soit sa distance.
//
// La silhouette lointaine y est composée dans le même nuanceur, dans une bande
// de v. Elle défile par rotation de texture, ce qui n'a de sens que sur un
// cylindre centré sur l'œil : une rotation uniforme, c'est exactement la
// parallaxe d'un objet infiniment loin. Le taux est calé pour lire à ~900 m -
// un plan latéral posé à 42 m qu'on faisait glisser 1,67× trop vite, c'était le
// cœur de l'effet « décor tiré au fil ».

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../../systems/runtime';
import { dayNightWeights } from '../../systems/daynight';
import { seasonNow } from '../../systems/season';
import { weather } from '../../systems/weather';
import { useStore } from '../../store';
import { CONFIG } from '../../data/config';
import { prevStation } from '../../data/loop';
import { journeyProgress } from '../../data/segments';
import { DISTRICTS } from '../../data/districts';
import {
  cityTexSize,
  drawCityInto,
  makeSkyTexture,
  makeSunsetSkyTexture,
  makeNightSkyTexture,
} from '../../textures/procedural';
import { gpuKit, type SkyTextures, type SkyUniforms } from '../webgpu/kit';

// Cylindre de ciel : mêmes angles apparents qu'avant (bord bas à −14°, faîte à
// +29,7° depuis la hauteur d'œil), simplement porté plus loin.
const R = 100;
const HEIGHT = 82;
const CY = 17.5;

// Bande occupée par la silhouette, en hauteur monde puis en v du cylindre.
const BAND_Y0 = -4;
const BAND_Y1 = 22;
const V0 = (BAND_Y0 - (CY - HEIGHT / 2)) / HEIGHT;
const V1 = (BAND_Y1 - (CY - HEIGHT / 2)) / HEIGHT;

/** Répétitions de la silhouette autour de l'horizon (largeur apparente des blocs). */
const SIL_REPEAT = 4;
/**
 * Mètres parcourus pour un tour complet de motif. Une répétition couvre 90° de
 * regard ; un objet à L mètres tourne de D/L radians pour D mètres parcourus,
 * d'où metersPerRepeat = (π/2)·L. À 1400, la silhouette se lit à ~890 m.
 */
const SIL_METERS_PER_REPEAT = 1400;

/** Un ciel bas de nuit renvoie la lueur orangée de la ville, il ne la mange pas. */
const NIGHT_CLOUD = new THREE.Color('#3a2f2c');
/** Sous l'averse, la couche s'épaissit et vire au plomb. */
const STORM_CLOUD = new THREE.Color('#6f757b');

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// La pollution lumineuse n'est pas constante d'un bout de la nuit à l'autre.
// Elle culmine le soir - enseignes allumées, bureaux pleins, trains encore
// fréquents - puis retombe à mesure que la ville s'éteint, pour atteindre son
// minimum aux petites heures (~3 h 30) avant de remonter à l'approche de
// l'aube. Sans ça, 1 h du matin renvoyait autant d'orange que 20 h, et le ciel
// ne devenait jamais franchement nocturne. On garde un plancher : même morte,
// une mégapole ne rend jamais l'horizon totalement noir.
function civicGlow(h: number): number {
  const activity = 0.5 - 0.5 * Math.cos(((h - 3.5) / 12) * Math.PI);
  return 0.34 + 0.66 * activity;
}

function makeSilhouetteBank(): { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const [w, h] = cityTexSize(2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return { ctx, tex };
}

const VERT = /* glsl */ `
varying vec2 vSkyUv;
void main() {
  vSkyUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uDay;
uniform sampler2D uGolden;
uniform sampler2D uNight;
uniform sampler2D uSilA;
uniform sampler2D uSilB;
uniform vec3 uWeights;      // jour, doré, nuit
uniform float uSilMix;      // 0 = banque A, 1 = banque B
uniform float uSilOffset;
uniform float uSilRepeat;
uniform vec2 uBand;         // v0, v1
uniform vec3 uHaze;
uniform float uHazeAmt;
uniform float uSilDark;
uniform vec3 uGlow;
uniform float uGlowAmt;
uniform vec3 uSeasonTint;
uniform float uSeasonAmt;
uniform vec3 uCloud;
uniform float uCloudAmt;
varying vec2 vSkyUv;

void main() {
  vec3 col =
      texture2D(uDay, vSkyUv).rgb * uWeights.x
    + texture2D(uGolden, vSkyUv).rgb * uWeights.y
    + texture2D(uNight, vSkyUv).rgb * uWeights.z;

  // La couverture nuageuse. Elle ne se pose pas non plus à plat : une couche de
  // stratus est PLUS SOMBRE AU ZÉNITH, où on la voit par la tranche, et
  // s'éclaircit vers l'horizon où la lumière la traverse de biais. C'est
  // exactement l'inverse du voile de chaleur ci-dessous, et c'est ce qui
  // distingue un ciel de pluie d'un ciel d'août.
  float lowSky = smoothstep(uBand.y + 0.30, uBand.y - 0.04, vSkyUv.y);
  col = mix(col, mix(uCloud * 0.82, uCloud, lowSky), uCloudAmt);

  // Voile de saison. Il ne se répand pas uniformément sur la voûte : la vapeur
  // d'eau d'un août de Tokyo s'accumule dans les basses couches, si bien que
  // l'horizon vire au blanc laiteux pendant que le zénith reste franchement
  // bleu. Un ciel teinté de haut en bas se lit comme un filtre de photo ; c'est
  // le DÉGRADÉ qui se lit comme de l'air.
  float hazeBand = 1.0 - smoothstep(uBand.y - 0.05, uBand.y + 0.42, vSkyUv.y);
  col = mix(col, uSeasonTint, uSeasonAmt * hazeBand);

  // Lueur urbaine : au-dessus de Tokyo, le ciel de nuit n'est pas noir. Les
  // millions de lampes que la ville tourne vers le haut lui font un dôme
  // orangé qui s'éteint en montant - et c'est sur lui que les silhouettes se
  // détachent, jamais sur du bleu nuit. Mais elle reste BASSE : la pollution
  // lumineuse se concentre sur l'horizon et s'efface vite en montant, sinon
  // c'est toute la voûte qui vire à l'orange au lieu de rester noire au zénith.
  col += uGlow * uGlowAmt * (1.0 - smoothstep(uBand.y - 0.02, uBand.y + 0.13, vSkyUv.y));

  float bv = (vSkyUv.y - uBand.x) / (uBand.y - uBand.x);
  if (bv > 0.0 && bv < 1.0) {
    vec2 suv = vec2(vSkyUv.x * uSilRepeat + uSilOffset, bv);
    vec4 sil = mix(texture2D(uSilA, suv), texture2D(uSilB, suv), uSilMix);
    // La silhouette n'est pas un objet mais une épaisseur d'atmosphère : elle
    // se noie dans la brume du moment, et s'assombrit la nuit.
    vec3 tinted = mix(sil.rgb * uSilDark, uHaze, uHazeAmt);
    col = mix(col, tinted, clamp(sil.a, 0.0, 1.0) * 0.88);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Le ciel en GLSL : le chemin historique, celui des six qualités WebGL. Son
 * jumeau à nœuds vit dans three/webgpu/impl/sky et expose EXACTEMENT le même
 * dictionnaire d'uniformes - c'est ce qui permet à tout le code d'animation
 * ci-dessous d'ignorer lequel des deux tourne.
 */
function makeSkyMaterialGL(tex: SkyTextures): {
  material: THREE.Material;
  uniforms: SkyUniforms;
} {
  const uniforms = {
    uDay: { value: tex.day },
    uGolden: { value: tex.golden },
    uNight: { value: tex.night },
    uSilA: { value: tex.silA },
    uSilB: { value: tex.silB },
    uWeights: { value: new THREE.Vector3(1, 0, 0) },
    uSilMix: { value: 0 },
    uSilOffset: { value: 0 },
    uSilRepeat: { value: tex.repeat },
    uBand: { value: new THREE.Vector2(tex.band[0], tex.band[1]) },
    uHaze: { value: new THREE.Color('#d6e8f2') },
    uHazeAmt: { value: 0.5 },
    uSilDark: { value: 1 },
    uGlow: { value: new THREE.Color('#c4702f') },
    uGlowAmt: { value: 0 },
    uSeasonTint: { value: new THREE.Color('#f7edd6') },
    uSeasonAmt: { value: 0 },
    uCloud: { value: new THREE.Color('#a8adb2') },
    uCloudAmt: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    // Boîte à ciel : jamais testée ni écrite en profondeur, dessinée avant
    // tout le reste. C'est ce qui la met « à l'infini » sans la reculer.
    depthTest: false,
    depthWrite: false,
    transparent: false,
    fog: false,
    toneMapped: false,
    uniforms,
  });
  return { material, uniforms };
}

export function SkyDome() {
  const scene = useThree((s) => s.scene);
  const arrivingBank = useRef<0 | 1>(0);
  const lastIndex = useRef<number>(CONFIG.startIndex);
  const pending = useRef<(() => void)[]>([]);

  const built = useMemo(() => {
    const start = CONFIG.startIndex;
    const startDir = useStore.getState().loopDirection;
    const banks = ([0, 1] as const).map((slot) => {
      const b = makeSilhouetteBank();
      const district = slot === 0 ? start : prevStation(start, startDir);
      drawCityInto(b.ctx, 2, false, DISTRICTS[district]);
      b.tex.needsUpdate = true;
      return { ...b, district };
    });

    const day = makeSkyTexture();
    const golden = makeSunsetSkyTexture();
    const night = makeNightSkyTexture();

    const tex: SkyTextures = {
      day,
      golden,
      night,
      silA: banks[0].tex,
      silB: banks[1].tex,
      band: [V0, V1],
      repeat: SIL_REPEAT,
    };
    const kit = gpuKit();
    const { material, uniforms } = kit ? kit.makeSkyMaterial(tex) : makeSkyMaterialGL(tex);

    return { banks, day, golden, night, material, uniforms };
  }, []);

  useFrame(() => {
    const { index, phase, loopDirection } = useStore.getState();
    const u = built.uniforms;

    // --- Bascule de banque au changement de gare (idiome historique) ---
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      arrivingBank.current = arrivingBank.current === 0 ? 1 : 0;
      const bank = built.banks[arrivingBank.current];
      bank.district = index;
      pending.current.push(() => {
        drawCityInto(bank.ctx, 2, false, DISTRICTS[bank.district]);
        bank.tex.needsUpdate = true;
      });
    }
    const task = pending.current.shift();
    if (task) task();

    // Durée d'inter-gare variable selon le tronçon : la source est
    // data/segments, partagée avec segEnv, les annonces et le quai.
    const p = journeyProgress(phase, runtime.phaseT, index, loopDirection);
    const wArr = smoothstep(0.38, 0.62, p);
    u.uSilMix.value = arrivingBank.current === 1 ? wArr : 1 - wArr;

    // --- Défilement de l'horizon : rotation pure, donc parallaxe d'infini ---
    u.uSilOffset.value = -runtime.distance / SIL_METERS_PER_REPEAT;

    // --- Heure de Tokyo ---
    const hourNow = ((runtime.clockMin / 60) % 24 + 24) % 24;
    const w = dayNightWeights(hourNow);
    (u.uWeights.value as THREE.Vector3).set(w.day, w.golden, w.night);
    const cityNight = Math.min(1, w.night + w.golden * 0.45);
    u.uSilDark.value = 1 - 0.62 * cityNight;
    // La brume de l'horizon est celle de la scène : une seule source de vérité.
    if (scene.fog instanceof THREE.Fog) (u.uHaze.value as THREE.Color).copy(scene.fog.color);
    u.uHazeAmt.value = 0.3 + 0.16 * w.day;
    // Lueur de fond, resserrée sur l'horizon puis modulée par l'activité de la
    // ville : forte le soir, presque éteinte au cœur de la nuit.
    u.uGlowAmt.value = (0.22 * w.night + 0.1 * w.golden) * civicGlow(hourNow);

    // --- Saison ---
    // L'air de Tokyo n'a pas la même épaisseur toute l'année : blanc laiteux
    // et moite en août, tranchant et bleu en janvier - c'est en hiver qu'on
    // voit le Fuji depuis les tours, jamais en été.
    const se = seasonNow();
    (u.uSeasonTint.value as THREE.Color).set(se.airTone);
    u.uSeasonAmt.value = Math.max(0, (0.13 + 0.4 * se.heat - 0.09 * se.cold) * (1 - w.night));

    // --- Le temps qu'il fait ---
    // La nuit, un ciel couvert n'est pas gris : il est BAS et il renvoie la
    // lueur de la ville. C'est même la seule nuit où le ciel est plus clair
    // que par temps dégagé, et tout Tokyo le sait.
    (u.uCloud.value as THREE.Color)
      .set('#a8adb2')
      .lerp(NIGHT_CLOUD, w.night)
      .lerp(STORM_CLOUD, weather.rain * 0.6);
    u.uCloudAmt.value = weather.cloud * 0.92;
    // La silhouette de l'horizon s'efface sous la couverture bien avant que
    // les gouttes ne se voient : c'est le premier signe que le temps tourne.
    u.uHazeAmt.value = Math.min(1, u.uHazeAmt.value + 0.55 * weather.cloud);
  });

  return (
    <mesh position={[0, CY, 0]} material={built.material} renderOrder={-1000} frustumCulled={false}>
      <cylinderGeometry args={[R, R, HEIGHT, 64, 1, true]} />
    </mesh>
  );
}
