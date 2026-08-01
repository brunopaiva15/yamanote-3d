// La pluie et la neige, calculées dans le nuanceur.
//
// --- Un volume qui suit l'œil, pas un monde qui pleut ---
//
// Faire tomber la pluie sur les six cents mètres de décor visibles coûterait
// des centaines de milliers de gouttes pour une image où l'on n'en distingue
// que celles des quinze premiers mètres. Au-delà, la pluie ne se voit plus
// goutte à goutte : elle se voit comme une PERTE DE PORTÉE - c'est
// `weather.visibility` qui s'en charge, dans la brume de scène, et c'est le
// premier effet de la pluie bien avant les gouttes elles-mêmes.
//
// Ce qui est modélisé ici, c'est donc une boîte de ±14 m attachée à la caméra,
// dans laquelle la précipitation se replie sur elle-même par un modulo. Une
// goutte qui sort par le bas rentre par le haut ; personne ne peut le voir,
// puisque le repliement a lieu à quatorze mètres, hors du cône où l'œil
// distingue encore un trait de deux centimètres.
//
// --- L'inclinaison, qui est tout ---
//
// Une pluie verticale vue depuis un train à quatre-vingt-dix, c'est la faute
// qui tue l'effet. Dans le repère du wagon, la goutte ne tombe pas : elle
// FILE VERS L'ARRIÈRE à la vitesse du train, et son trait s'incline d'autant.
// À l'arrêt en gare elle se redresse, et c'est en la regardant se redresser
// pendant le freinage qu'on sent le mieux qu'on ralentit. Le trait est donc
// construit dans l'espace de la caméra, aligné sur la vitesse RELATIVE de la
// goutte - chute plus vent plus vitesse du train - et non sur la verticale.
//
// Descendu sur le quai, le joueur change de repère : la gare devient fixe, le
// terme de vitesse tombe, et la pluie redevient verticale. Rien de spécial à
// écrire pour ça, il suffit de lire `runtime.playerFrame`.
//
// --- Ce qui abrite ---
//
// Deux volumes soustraits, et deux seulement, parce que ce sont les deux seuls
// endroits où l'œil se trouve SOUS quelque chose :
//
//   · l'intérieur du wagon. Sans lui, il pleut entre la banquette et le
//     plafond - le test de profondeur ne peut rien, la goutte est devant la
//     paroi qu'elle devrait avoir derrière elle ;
//   · l'auvent du quai, dont on connaît l'emprise exacte (systems/
//     stationOcclusion la tient déjà à jour pour le décor de voie).
//
// Les deux sont retranchés dans le nuanceur de sommets en écrasant le quad à
// une aire nulle : rien à rastériser, pas de `discard`, pas de surcoût.

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { CANOPY_Y, PLATFORM_DEPTH, PSD_X } from '../data/stationGeometry';
import { runtime } from '../systems/runtime';
import { weather } from '../systems/weather';
import { stationOcclusion } from '../systems/stationOcclusion';
import { qualityLevel, usePerf, type Quality } from '../systems/perf';
import { gpuKit, type PrecipitationField, type PrecipitationParams } from './webgpu/kit';

/**
 * Demi-emprise du volume de précipitation (m).
 *
 * Douze mètres, et pas trente : c'est la DENSITÉ qui fait la pluie, pas
 * l'étendue. Doubler la boîte divise la densité par huit à nombre de gouttes
 * constant, et une pluie trop diluée ne se lit plus comme de la pluie mais
 * comme des poussières. Au-delà, de toute façon, la pluie ne se voit plus
 * goutte à goutte : elle se voit dans la brume.
 */
const BOX = new THREE.Vector3(12, 10, 12);

/** Vitesse de chute (m/s) : une goutte tombe à neuf, un flocon à un. */
const RAIN_FALL = 9.2;
const SNOW_FALL = 1.1;

/**
 * Nombre de traces par palier de qualité.
 *
 * Une trace, c'est deux triangles et aucune texture : le poste n'est pas le
 * remplissage mais le nombre de sommets. Trois mille gouttes valent six mille
 * triangles - le tiers d'un seul immeuble de la ville - pour un seul appel de
 * rendu.
 */
function counts(quality: Quality): { rain: number; snow: number } {
  // Le mode Extraordinaire intègre la précipitation dans un nuanceur de calcul
  // et ne dessine plus qu'une position par sommet : le champ peut être trois
  // fois plus dense pour un sommet devenu trois fois moins cher. Sous une
  // averse, c'est le changement le plus visible du mode.
  if (quality === 'extraordinary') return { rain: 11000, snow: 5200 };
  const level = qualityLevel(quality);
  if (level <= 1) return { rain: 3200, snow: 1600 };
  if (level === 2) return { rain: 2400, snow: 1200 };
  if (level === 3) return { rain: 1600, snow: 900 };
  return { rain: 900, snow: 550 };
}

const VERT = /* glsl */ `
attribute vec3 aSeed;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec3 uDrift;    // intégrale de la vitesse, repliée dans la boîte
uniform vec3 uVel;      // vitesse relative à la caméra (m/s)
uniform vec2 uSize;     // largeur, longueur de la trace (m)
uniform float uSwirl;   // flottement latéral du flocon (m)
uniform float uTime;
uniform vec4 uCar;      // demi-largeur, plafond, centre z, demi-longueur (0 = inactif)
uniform vec4 uShelter;  // abscisse intérieure, extérieure, plafond, côté × actif
uniform vec2 uShelterZ;
varying vec2 vRainUv;
varying float vRainFade;

void main() {
  vec3 span = uBox * 2.0;
  vec3 origin = uCam - uBox;
  // Repliement : la goutte qui sort par le bas rentre par le haut, et le champ
  // reste centré sur l'œil quoi qu'il arrive - y compris quand le joueur
  // change de repère en descendant sur le quai.
  vec3 p = mod(aSeed * span + uDrift - origin, span) + origin;
  // Le flocon ne tombe pas droit : il flotte. C'est ce qui le distingue d'une
  // goutte bien plus que sa forme ou sa vitesse.
  p.x += sin(uTime * 0.9 + aSeed.x * 41.0) * uSwirl;
  p.z += cos(uTime * 0.7 + aSeed.z * 37.0) * uSwirl;

  float alive = 1.0;
  // Sous le pavillon du wagon.
  if (uCar.w > 0.0 && abs(p.x) < uCar.x && p.y < uCar.y && p.y > -0.35
      && abs(p.z - uCar.z) < uCar.w) alive = 0.0;
  // Sous l'auvent du quai.
  float sx = p.x * uShelter.w;
  if (uShelter.w != 0.0 && sx > uShelter.x && sx < uShelter.y && p.y < uShelter.z
      && p.z > uShelterZ.x && p.z < uShelterZ.y) alive = 0.0;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  // Le trait s'aligne sur la vitesse RELATIVE, projetée dans le plan de
  // l'image : c'est exactement ce que fait une pose longue.
  vec3 velView = (viewMatrix * vec4(uVel, 0.0)).xyz;
  vec2 dir = normalize(velView.xy + vec2(0.0, -0.0001));
  vec2 perp = vec2(-dir.y, dir.x);
  // Toutes les gouttes ne sont pas de la même taille, et une averse dont
  // chaque trait fait exactement la même longueur se lit comme une trame.
  float grade = 0.55 + 0.9 * aSeed.y;
  mv.xy += (dir * (position.y * uSize.y * grade) + perp * (position.x * uSize.x)) * alive;

  // Fondu au bord de la boîte : sans lui, les traces apparaissent sur un plan.
  // Il ne commence qu'à quatre-vingt-dix pour cent du rayon, et il s'étale
  // au-delà - les coins de la boîte sont à 1,7 rayon. Un fondu qui démarrait à
  // mi-rayon éteignait NEUF gouttes sur DIX : le champ semblait vide alors
  // qu'il était plein.
  float d = length(p - uCam);
  vRainFade = alive * (1.0 - smoothstep(uBox.x * 0.9, uBox.x * 1.5, d)) * (0.45 + 0.55 * fract(aSeed.z * 7.31));
  vRainUv = uv;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRound;
varying vec2 vRainUv;
varying float vRainFade;

void main() {
  vec2 c = vRainUv - 0.5;
  // Une goutte est un trait doux sur sa largeur et atténué à ses deux bouts ;
  // un flocon est une pastille. Une seule expression pour les deux.
  float streak = (1.0 - smoothstep(0.15, 0.5, abs(c.x))) * (1.0 - smoothstep(0.2, 0.5, abs(c.y)) * 0.75);
  float flake = 1.0 - smoothstep(0.16, 0.46, length(c));
  float a = mix(streak, flake, uRound) * uOpacity * vRainFade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

/** Teinte de référence des traces : la précipitation tire vers le blanc. */
const WHITE = new THREE.Color('#ffffff');

/**
 * Le champ de précipitation GLSL - le chemin historique, celui des six
 * qualités WebGL. Son jumeau WebGPU (three/webgpu/impl/precipitation) intègre
 * les positions dans un nuanceur de calcul ; les deux exposent le même
 * `PrecipitationField`, si bien que la logique météo ci-dessous est la même
 * mot pour mot d'un moteur à l'autre.
 */
function makeFieldGL(count: number, round: boolean): PrecipitationField {
  // Le quad est écrit à la main plutôt que pris d'une PlaneGeometry : celle-ci
  // devrait être conservée pour être libérée, et la libérer libérerait les
  // tampons que la géométrie instanciée lui emprunte.
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([-0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0]),
      3,
    ),
  );
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), 2));
  geo.setIndex([0, 2, 1, 2, 3, 1]);

  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) seeds[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
  geo.instanceCount = count;
  // La boîte suit la caméra : aucune sphère englobante n'a de sens ici.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    // Un quad billboardé n'a pas de « bon » côté : l'orientation dépend de
    // l'inclinaison de la trace, qui change avec la vitesse du train.
    side: THREE.DoubleSide,
    // Test de profondeur OUI - une goutte passe derrière un immeuble -, mais
    // écriture NON : mille traces translucides qui s'écrivent en profondeur se
    // masquent les unes les autres selon l'ordre de rendu.
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uBox: { value: BOX.clone() },
      uDrift: { value: new THREE.Vector3() },
      uVel: { value: new THREE.Vector3(0, -1, 0) },
      uSize: { value: new THREE.Vector2(0.02, 0.5) },
      uSwirl: { value: 0 },
      uTime: { value: 0 },
      uCar: { value: new THREE.Vector4() },
      uShelter: { value: new THREE.Vector4() },
      uShelterZ: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color('#dfe7ee') },
      uOpacity: { value: 0 },
      uRound: { value: round ? 1 : 0 },
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.rainField = round ? 'snow' : 'rain';
  mesh.frustumCulled = false;
  // AVANT les autres transparents, et c'est tout le sujet.
  //
  // Le vitrage du wagon est transparent mais ÉCRIT la profondeur (c'est le
  // défaut de three, et il n'y a pas lieu de le changer ici). Une pluie
  // dessinée après lui était donc intégralement rejetée par le test de
  // profondeur : la vitre est à un mètre quarante, les gouttes à cinq. On ne
  // voyait rien, et rien ne le disait - ni erreur de nuanceur, ni instance
  // manquante, ni matériau muet.
  //
  // Dessinée avant, la pluie est composée d'abord et la vitre vient la teinter
  // par-dessus : c'est exactement l'ordre physique. Elle reste occultée par le
  // décor opaque, lui, qui a écrit sa profondeur au passage précédent.
  mesh.renderOrder = -1;
  mesh.visible = false;

  const drift = new THREE.Vector3();
  const u = mat.uniforms;
  return {
    mesh,
    setCount(n: number) {
      geo.instanceCount = Math.max(1, Math.min(count, n));
    },
    update(dt: number, p: PrecipitationParams) {
      // La dérive est GLOBALE : toutes les gouttes partagent la même, et c'est
      // la graine d'instance qui les distingue. C'est la limite du chemin
      // WebGL, et exactement ce que le nuanceur de calcul lève.
      drift.addScaledVector(p.vel, dt);
      wrapDrift(drift);
      (u.uDrift.value as THREE.Vector3).copy(drift);
      (u.uCam.value as THREE.Vector3).copy(p.cam);
      (u.uVel.value as THREE.Vector3).copy(p.vel);
      (u.uSize.value as THREE.Vector2).copy(p.size);
      u.uSwirl.value = p.swirl;
      (u.uColor.value as THREE.Color).copy(p.color);
      u.uOpacity.value = p.opacity;
      (u.uCar.value as THREE.Vector4).copy(p.car);
      (u.uShelter.value as THREE.Vector4).copy(p.shelter);
      (u.uShelterZ.value as THREE.Vector2).copy(p.shelterZ);
      u.uTime.value = (u.uTime.value + dt) % 1000;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/** Replie une dérive dans [0, span) : la précision du float y survit sans fin. */
function wrapDrift(v: THREE.Vector3): void {
  v.x = ((v.x % (BOX.x * 2)) + BOX.x * 2) % (BOX.x * 2);
  v.y = ((v.y % (BOX.y * 2)) + BOX.y * 2) % (BOX.y * 2);
  v.z = ((v.z % (BOX.z * 2)) + BOX.z * 2) % (BOX.z * 2);
}

export function Weather() {
  const quality = usePerf((s) => s.quality);
  const gl = useThree((state) => state.gl);
  const { rain: rainCount, snow: snowCount } = counts(quality);

  const built = useMemo(() => {
    const kit = gpuKit();
    const make = (count: number, round: boolean) =>
      kit ? kit.makePrecipitation(gl, count, round, BOX) : makeFieldGL(count, round);
    return { rain: make(rainCount, false), snow: make(snowCount, true) };
  }, [gl, rainCount, snowCount]);

  useEffect(
    () => () => {
      built.rain.dispose();
      built.snow.dispose();
    },
    [built],
  );

  const scratch = useMemo(
    () => ({
      cam: new THREE.Vector3(),
      tone: new THREE.Color(),
      params: {
        cam: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        size: new THREE.Vector2(),
        swirl: 0,
        color: new THREE.Color(),
        opacity: 0,
        car: new THREE.Vector4(),
        shelter: new THREE.Vector4(),
        shelterZ: new THREE.Vector2(),
      } satisfies PrecipitationParams,
    }),
    [],
  );

  useFrame(({ camera, scene }, rawDt) => {
    const dt = Math.min(0.05, Math.max(0, rawDt));
    camera.getWorldPosition(scratch.cam);

    // Vitesse du décor par rapport à l'œil. À bord, le train est fixe et c'est
    // le monde qui file vers +z ; sur le quai, la gare est fixe et l'air avec.
    const along = runtime.playerFrame === 'car' ? runtime.speed : 0;
    const gust = weather.wind * 3.4;

    // L'auvent du quai : emprise exacte, celle que le décor de voie utilise
    // déjà. Il n'abrite que si le joueur y est vraiment sous - mais le test
    // vaut aussi pour les gouttes vues depuis le wagon, et c'est heureux :
    // il ne pleut pas sous l'auvent d'en face non plus.
    const sheltered = stationOcclusion.active > 0.4 ? stationOcclusion.side : 0;

    // La précipitation prend la couleur du ciel derrière elle. Une pluie
    // blanche sur un ciel d'orage se lit comme de la neige ; une pluie noire
    // sur un ciel clair se lit comme de la suie.
    if (scene.fog instanceof THREE.Fog) scratch.tone.copy(scene.fog.color);
    else scratch.tone.set('#c9d6e2');

    const p = scratch.params;
    for (const [f, amount, fall, cap, round] of [
      [built.rain, weather.rain, RAIN_FALL, rainCount, false],
      [built.snow, weather.snow, SNOW_FALL, snowCount, true],
    ] as const) {
      const visible = amount > 0.015;
      f.mesh.visible = visible;
      if (!visible) continue;

      // Une averse ne tombe pas plus vite qu'une bruine : elle tombe plus
      // DRU. C'est le nombre de traces affichées qui varie, pas leur vitesse -
      // d'où le découpage du tampon d'instances plutôt qu'un fondu d'opacité,
      // qui donnerait une pluie fantôme.
      f.setCount(Math.round(cap * Math.min(1, amount)));

      p.cam.copy(scratch.cam);
      p.vel.set(gust * (round ? 0.8 : 0.45), -fall, along + gust * 0.3);

      // Longueur de la trace : c'est la distance parcourue pendant le temps de
      // pose de l'œil, donc elle s'allonge avec la vitesse. À quatre-vingt-dix,
      // une goutte trace un mètre vingt.
      const speed = p.vel.length();
      // Largeur : une trace de moins de deux ou trois pixels disparaît dans
      // l'échantillonnage. À dix mètres et 70° de champ, un pixel vaut treize
      // millimètres - d'où ces trois centimètres et demi, qui ne sont pas la
      // largeur d'une goutte mais celle de sa TRACE.
      if (round) p.size.set(0.07 + 0.04 * amount, 0.07 + 0.04 * amount);
      else p.size.set(0.035 + 0.02 * amount, Math.min(1.15, 0.2 + speed * 0.036));
      p.swirl = round ? 0.35 + 0.5 * weather.wind : 0;

      p.color.copy(scratch.tone).lerp(WHITE, round ? 0.75 : 0.5);
      p.opacity = round ? 0.72 : 0.45 + 0.25 * amount;

      // Wagon : seul l'intérieur de NOTRE voiture existe, et c'est le seul
      // endroit d'où l'on regarde par une vitre.
      p.car.set(
        CONFIG.carHalfWidth + 0.05,
        CONFIG.carHeight + 0.12,
        runtime.trainZ,
        CONFIG.carHalfLength + 0.4,
      );
      p.shelter.set(PSD_X - 0.4, PSD_X + PLATFORM_DEPTH + 0.4, CANOPY_Y, sheltered);
      p.shelterZ.set(stationOcclusion.z0, stationOcclusion.z1);

      f.update(dt, p);
    }
  });

  return (
    <>
      <primitive object={built.rain.mesh} />
      <primitive object={built.snow.mesh} />
    </>
  );
}
