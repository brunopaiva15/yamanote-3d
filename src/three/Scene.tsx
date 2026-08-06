// Ambiance : fin d'après-midi dorée. Soleil bas et chaud à travers les vitres,
// intérieur fluorescent doux, brume chaude au loin, réflexions d'environnement
// pour les laqués et le chrome, post-process filmique discret
// (bloom seuil haut, grain, vignette).

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { installStationProbe } from '../dev/stationProbe';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer, Bloom, N8AO, Vignette, ToneMapping, Noise } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { CONFIG } from '../data/config';
import { qualityLevel, usePerf, type PerfLevel } from '../systems/perf';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { seasonNow } from '../systems/season';
import { weather } from '../systems/weather';
import { segEnv } from '../systems/segmentEnv';
import { applyShadowFlags } from './shadowFlags';
import { gpuKit, type RenderPipelineHandle } from './webgpu/kit';
import { findTargetedPax } from '../systems/paxTargeting';

/**
 * Intensité d'un luminaire de secours (à comparer aux 3,0 d'un néon ordinaire).
 * Assez pour qu'on se voie et qu'on lise l'heure, pas assez pour qu'on lise un
 * journal : c'est exactement le cahier des charges d'un 非常灯.
 */
const EMERGENCY_LAMP = 0.5;

const LAMP_POSITIONS: [number, number, number][] = [
  [0, 2.16, -7.5],
  [0, 2.16, -3.75],
  [0, 2.16, 0],
  [0, 2.16, 3.75],
  [0, 2.16, 7.5],
];

// Paliers 3-5 : plafonne la résolution de rendu (le fill-rate est souvent le
// goulot sur les écrans haute densité). En dessous, densité native (cap 2,
// comme le dpr initial du Canvas). Palier 5 (Très basse) : rendu sous la
// résolution de l'écran.
function AdaptiveDpr({ level }: { level: PerfLevel }): null {
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    const native = Math.min(window.devicePixelRatio || 1, 2);
    // Le mode Extraordinaire rend à la densité NATIVE, comme Ultra.
    //
    // Il a d'abord été plafonné à 1,5, au motif que SSGI, SSR et bokeh sont
    // des effets à la résolution et qu'on rendrait mieux le budget en rebonds
    // de lumière qu'en pixels. C'était une erreur d'arbitrage : sur un écran
    // dense, un quart de pixels en moins par axe se voit immédiatement et sur
    // TOUTE l'image, quand les rebonds ne se voient que là où il y en a. Un
    // mode qu'on choisit pour sa beauté ne doit pas commencer par être moins
    // net que celui qu'on quitte.
    const cap =
      level >= 5 ? 0.75 : level >= 4 ? 1 : level >= 3 ? 1.25 : native;
    setDpr(Math.min(native, cap));
  }, [level, setDpr]);
  return null;
}

// Réflexions douces sur le chrome et les panneaux laqués, sans requête réseau.
//
// `PMREMGenerator` existe dans les deux builds de three, mais ce ne sont pas la
// même classe : celle importée ici filtre avec un WebGLRenderer. Le mode
// Extraordinaire passe donc par la sienne (three/webgpu/impl/environment), avec
// la même RoomEnvironment et le même flou.
function EnvironmentMap(): null {
  const { gl, scene } = useThree();
  useEffect(() => {
    const kit = gpuKit();
    if (kit) {
      const env = kit.makeEnvironment(gl);
      scene.environment = env.texture;
      scene.environmentIntensity = 0.38;
      return () => {
        scene.environment = null;
        env.dispose();
      };
    }
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    // De quoi faire vivre l'inox des barres et le brillant du sol, sans vernis.
    scene.environmentIntensity = 0.38;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/**
 * Distance de mise au point par défaut, quand on ne regarde personne (m) :
 * dans le wagon, la longueur de l'allée jusqu'au soufflet ; sur le quai, la
 * profondeur où les choses commencent à compter.
 */
const FOCUS_IDLE_CAR = 5.2;
const FOCUS_IDLE_PLATFORM = 11;
/** Portée de la recherche du visage regardé : au-delà, on ne le fixe plus. */
const FOCUS_RANGE = 7.5;
/**
 * Taille du bokeh, en pixels de rayon à flou maximal.
 *
 * La profondeur de champ est là pour DÉTACHER le fond, pas pour empêcher de
 * lire une affiche. Avec la rampe large que `setFocus` impose désormais, rien
 * de ce qui est dans le wagon n'atteint ce rayon-là.
 */
const BOKEH = 1.1;
/** Vitesse d'accommodation (1/s) : l'œil met un tiers de seconde, pas zéro. */
const FOCUS_EASE = 4.5;

/**
 * Le pipeline WebGPU : il REMPLACE le rendu de react-three-fiber (une priorité
 * de frame non nulle suffit à le lui dire) par la chaîne SSGI → SSR →
 * profondeur de champ → bloom → étalonnage.
 */
function WebGPUEffects(): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const pipeline = useRef<RenderPipelineHandle | null>(null);
  const focus = useRef(FOCUS_IDLE_CAR);

  useEffect(() => {
    const kit = gpuKit();
    if (!kit) return;
    const p = kit.makePipeline(gl, scene, camera, {
      ssgi: true,
      ssr: true,
      dof: true,
      bloom: CONFIG.bloom,
    });
    pipeline.current = p;
    return () => {
      pipeline.current = null;
      p.dispose();
    };
  }, [gl, scene, camera]);

  useFrame((_, dt) => {
    const p = pipeline.current;
    if (!p) return;
    // L'œil accommode sur le VISAGE qu'on regarde - le jeu sait déjà lequel,
    // c'est celui à qui l'on pourrait adresser la parole. À défaut, il se pose
    // sur le plan où il y a quelque chose à voir.
    const target = findTargetedPax(FOCUS_RANGE);
    const want = target
      ? target.dist
      : runtime.playerFrame === 'platform'
        ? FOCUS_IDLE_PLATFORM
        : FOCUS_IDLE_CAR;
    focus.current += (want - focus.current) * Math.min(1, Math.max(0, dt) * FOCUS_EASE);
    p.setFocus(focus.current, BOKEH);
    p.render();
  }, 1);

  return null;
}

// Activation en une passe sur toute la scène, au montage. Ce qui est construit
// hors React après coup appelle applyShadowFlags lui-même (voir shadowFlags.ts).
function ShadowFlags(): null {
  const { scene } = useThree();
  useEffect(() => {
    applyShadowFlags(scene);
  }, [scene]);
  return null;
}

// Trois ambiances lumineuses fondues selon l'heure réelle de Tokyo.
const SUN = {
  day: { color: new THREE.Color('#fff6e4'), intensity: 1.7, pos: new THREE.Vector3(26, 30, -16) },
  golden: { color: new THREE.Color('#ffb37a'), intensity: 1.6, pos: new THREE.Vector3(34, 7, -14) },
  night: { color: new THREE.Color('#8fa4cc'), intensity: 0.16, pos: new THREE.Vector3(20, 26, 12) },
};
// La brume de nuit n'est pas le noir de la nuit : elle est teintée par la
// lueur urbaine qu'elle diffuse, et c'est ce qui empêche le lointain de tomber
// dans un aplat sombre où plus rien ne se distingue.
const FOG_COLORS = { day: new THREE.Color('#d6e8f2'), golden: new THREE.Color('#dcae8f'), night: new THREE.Color('#241f2a') };
const BG_COLORS = { day: new THREE.Color('#bcdaee'), golden: new THREE.Color('#e0b494'), night: new THREE.Color('#131320') };
const HEMI_SKY = { day: new THREE.Color('#cfe6f6'), golden: new THREE.Color('#eec5ae'), night: new THREE.Color('#2c3854') };
const AMBIENT = { day: new THREE.Color('#e9f1f5'), golden: new THREE.Color('#e3cabb'), night: new THREE.Color('#38405a') };

/**
 * Le gris d'un ciel couvert de Tokyo. Ni bleu ni noir : un gris légèrement
 * chaud, celui d'une couche de stratus éclairée par-derrière. C'est vers lui
 * que brume et fond glissent à mesure que la couverture se ferme.
 */
const overcastTone = new THREE.Color('#a8adb2');

/**
 * Longueur horizontale conservée de la position du soleil (m) et rayon auquel
 * elle est ramenée.
 *
 * La direction seule compte pour une lumière directionnelle - mais PAS sa
 * distance : la caméra d'ombre est posée à la position de la lumière, et son
 * `far` vaut 100. Un soleil d'été renvoyé à cent cinquante mètres de haut
 * ferait disparaître toutes les ombres de la scène.
 */
const SUN_H = 30.5;
const SUN_RADIUS = 43;

function mixColor(out: THREE.Color, w: { day: number; golden: number; night: number }, set: { day: THREE.Color; golden: THREE.Color; night: THREE.Color }): THREE.Color {
  out.setRGB(
    set.day.r * w.day + set.golden.r * w.golden + set.night.r * w.night,
    set.day.g * w.day + set.golden.g * w.golden + set.night.g * w.night,
    set.day.b * w.day + set.golden.b * w.golden + set.night.b * w.night,
  );
  return out;
}

/**
 * Position du soleil de midi pour une hauteur méridienne donnée.
 *
 * À Tokyo (35,7° N), le soleil culmine à 31° le 21 décembre et à 78° le
 * 21 juin. C'est la plus grande différence visible entre deux saisons depuis
 * l'intérieur du wagon : à 31° le soleil entre par la baie et va frapper la
 * banquette d'en face jusqu'au dossier ; à 78° il tombe presque à pic, ne
 * dépasse pas l'appui de fenêtre, et l'intérieur reste dans son propre
 * éclairage. Les rayons plafonnent à 3,2 (~73°) : au-delà, l'ombre du portique
 * caténaire cesse de balayer le wagon et on perd le plus bel effet de la course.
 */
function seasonalSunPos(out: THREE.Vector3, noonAltitude: number): THREE.Vector3 {
  const t = Math.min(3.2, Math.max(0.5, Math.tan((noonAltitude * Math.PI) / 180)));
  return out.set(26, t * SUN_H, -16).setLength(SUN_RADIUS);
}

// Pilote lumières, brume et fond selon l'heure (jamais par re-render React).
//
// Les mélanges coûteux (couleurs, positions, brume, fond) restent throttlés à
// 0,5 s ; le bloc throttlé ne stocke que les intensités DE BASE. Après le
// throttle, chaque frame applique un multiplicateur d'assombrissement issu de
// segEnv (passage sous un pont ~0,3-0,5 s, toiture de gare) : à ombre nulle
// le résultat est identique au comportement historique, le fondu jour/nuit
// n'est donc jamais concurrencé. Brume et fond ne sont pas touchés (leur
// cadence 0,5 s scintillerait contre un passage de pont). Les pointLight du
// wagon ne sont pas atténués : les néons restent allumés sous un pont.
/**
 * Sonde de gare, en développement seulement : `__stationProbe()` dans la
 * console rapporte les volumes qui s'interpénètrent. Le placement du mobilier
 * n'arbitre que des emprises AU SOL ; tout ce qui est suspendu se posait
 * jusqu'ici à l'aveugle, fichier par fichier.
 */
function StationProbe() {
  const { scene, gl } = useThree();
  useEffect(() => installStationProbe(scene, gl), [scene, gl]);
  return null;
}

function DayNightLighting({ level }: { level: PerfLevel }) {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const flash = useRef<THREE.AmbientLight>(null);
  const acc = useRef(1);
  const tmp = useRef(new THREE.Color());
  const tint = useRef(new THREE.Color());
  const dayPos = useRef(new THREE.Vector3());
  const bases = useRef({ sun: 1.7, fill: 0.4, hemi: 0.62, amb: 0.4, dayness: 1 });

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current >= 0.5) {
      acc.current = 0;
      const w = dayNightWeights(runtime.clockMin / 60);
      const se = seasonNow();
      tint.current.set(se.airTone);
      // Le soleil d'hiver ne se contente pas d'être bas : il est FAIBLE. Il
      // traverse une épaisseur d'atmosphère plus grande et arrive à l'oblique
      // sur les surfaces horizontales.
      const seasonSun = 1 - 0.2 * se.cold + 0.06 * se.heat;
      // Le ciel couvert ne baisse pas la lumière : il la DÉPLACE. Le soleil
      // s'éteint presque complètement - un ciel de pluie n'a pas d'ombres
      // portées, c'est ce qui le trahit avant tout le reste - pendant que
      // l'hémisphérique, elle, tient bon : la voûte entière devient la source.
      const overcast = weather.cloud;
      const b = bases.current;
      b.sun =
        (SUN.day.intensity * w.day + SUN.golden.intensity * w.golden + SUN.night.intensity * w.night) *
        seasonSun *
        (1 - 0.86 * overcast);
      b.fill = (0.4 * w.day + 0.5 * w.golden + 0.1 * w.night) * (1 - 0.5 * overcast);
      b.hemi = (0.62 * w.day + 0.52 * w.golden + 0.22 * w.night) * (1 - 0.18 * overcast);
      b.amb = (0.4 * w.day + 0.35 * w.golden + 0.24 * w.night) * (1 - 0.1 * overcast);
      b.dayness = w.day + 0.8 * w.golden + 0.25 * w.night;
      if (sun.current) {
        mixColor(sun.current.color, w, { day: SUN.day.color, golden: SUN.golden.color, night: SUN.night.color });
        sun.current.color.lerp(tint.current, 0.3 * w.day);
        sun.current.position
          .set(0, 0, 0)
          .addScaledVector(seasonalSunPos(dayPos.current, se.noonAltitude), w.day)
          .addScaledVector(SUN.golden.pos, w.golden)
          .addScaledVector(SUN.night.pos, w.night);
      }
      if (hemi.current) mixColor(hemi.current.color, w, HEMI_SKY).lerp(tint.current, 0.22 * w.day);
      if (amb.current) mixColor(amb.current.color, w, AMBIENT).lerp(tint.current, 0.18 * w.day);
      // Épaisseur d'air de la saison : l'hiver sec de Tokyo porte loin, la
      // moiteur d'août noie les tours à six cents mètres. Ce n'est pas un
      // réglage d'humeur, c'est la portée réelle du regard.
      // Portée du regard : la clarté de la saison, puis ce que le temps qu'il
      // fait lui retire. Sous une averse, la ville s'arrête à cent mètres -
      // c'est le premier effet de la pluie, bien avant les gouttes.
      const clarity = se.clarity * weather.visibility;
      if (scene.fog instanceof THREE.Fog) {
        mixColor(scene.fog.color, w, FOG_COLORS)
          .lerp(tint.current, 0.24 * (1 - w.night))
          .lerp(overcastTone, 0.55 * overcast * (1 - 0.5 * w.night));
        // Portée réelle du regard, et non portée du décor. Elle valait 220 m de
        // jour du temps où la ville s'arrêtait à soixante-six mètres : tout ce
        // qui était derrière n'existant pas, la brume servait de mur, et le
        // paysage se fermait à deux cents mètres même par un ciel de janvier.
        // Or un matin clair de Tokyo porte à des kilomètres - c'est là qu'on
        // voit le Fuji depuis les tours - et c'est SEULEMENT le temps qu'il
        // fait qui referme la vue : sous l'averse, la ville s'arrête à cent
        // mètres, et `weather.visibility` s'en charge déjà.
        scene.fog.near = (45 * w.day + 32 * w.golden + 22 * w.night) * clarity;
        scene.fog.far = (520 * w.day + 400 * w.golden + 320 * w.night) * clarity;
      }
      if (scene.background instanceof THREE.Color) {
        mixColor(tmp.current, w, BG_COLORS)
          .lerp(tint.current, 0.24 * (1 - w.night))
          .lerp(overcastTone, 0.7 * overcast * (1 - 0.5 * w.night));
        scene.background.copy(tmp.current);
      }
    }

    // Assombrissement par frame : pont au-dessus ou grande toiture de gare.
    const b = bases.current;
    const shade = Math.max(segEnv.bridgeShade, 0.7 * segEnv.roofShade);
    const dim = 1 - 0.6 * shade * b.dayness;
    if (sun.current) sun.current.intensity = b.sun * dim;
    if (fill.current) fill.current.intensity = b.fill * dim;
    if (hemi.current) hemi.current.intensity = b.hemi * dim;
    if (amb.current) amb.current.intensity = b.amb * dim;
    // L'éclair a sa propre source, et froide : mêlé aux autres il aurait fallu
    // le fondre avec des teintes d'heure dorée recalculées deux fois par
    // seconde, et il aurait clignoté orange.
    if (flash.current) flash.current.intensity = weather.flash * 2.6;
  });

  // Paliers de qualité : ombres du soleil réduites (palier 2) puis coupées
  // (palier 3). La lumière est re-montée à chaque changement (key) pour que
  // l'ancienne shadow map soit réellement libérée.
  const shadowTier = level >= 3 ? 'off' : level >= 2 ? 'low' : 'full';
  const shadowMapSize = shadowTier === 'low' ? 1024 : 2048;

  return (
    <>
      <directionalLight
        key={`sun-${shadowTier}`}
        ref={sun}
        position={[26, 30, -16]}
        intensity={1.7}
        color="#fff6e4"
        castShadow={shadowTier !== 'off'}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={14}
        shadow-camera-bottom={-8}
        shadow-camera-near={5}
        shadow-camera-far={100}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
      />
      <directionalLight ref={fill} position={[-30, 16, 18]} intensity={0.4} color="#dfeaf2" />
      <hemisphereLight ref={hemi} args={['#cfe6f6', '#8d9088', 0.62]} />
      <ambientLight ref={amb} intensity={0.4} color="#e9f1f5" />
      {/* L'éclair : une source à part, éteinte 99 % du temps. */}
      <ambientLight ref={flash} intensity={0} color="#dce9ff" />
    </>
  );
}

/**
 * Les néons du wagon. Ils ne s'éteignent qu'une fois : quand la caténaire
 * lâche (`runtime.carPower`). Le reste du temps leur intensité est fixe - un
 * pont au-dessus de la voie n'atteint pas l'éclairage intérieur, c'est même à
 * ça qu'on voit qu'on est dedans.
 */
function CabinLights({
  positions,
  intensity,
}: {
  positions: [number, number, number][];
  intensity: number;
}) {
  const lamps = useRef<(THREE.PointLight | null)[]>([]);
  useFrame(() => {
    // Un tube fluorescent ne suit pas la tension linéairement : il tient, il
    // blêmit, puis il lâche. La puissance 1,6 donne cet affaissement.
    const p = Math.pow(runtime.carPower, 1.6);
    for (const l of lamps.current) if (l) l.intensity = intensity * p;
  });
  return (
    <>
      {positions.map((pos, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lamps.current[i] = l;
          }}
          position={pos}
          intensity={intensity}
          distance={7}
          decay={1.7}
          color="#fff0da"
        />
      ))}
    </>
  );
}

/**
 * L'éclairage de secours (非常灯), sur les batteries de bord.
 *
 * Une rame privée de caténaire ne devient pas noire : la réglementation
 * japonaise impose que l'essentiel reste utilisable pendant une panne
 * d'alimentation, et quelques luminaires restent allumés. Ils sont RARES -
 * deux dans la longueur du wagon - et FROIDS, là où les néons ordinaires
 * tirent sur le jaune : c'est ce contraste qui fait qu'une voiture sur
 * batteries ne ressemble à aucune autre.
 *
 * Ils suivent `runtime.emergencyLight`, et NON l'inverse de `carPower` : le
 * relais de secours attend que l'alimentation normale soit vraiment perdue au
 * lieu de basculer à chaque décrochage du convertisseur. À pleine tension ils
 * n'éclairent rien du tout, et ne coûtent donc rien de plus qu'une intensité à
 * zéro.
 */
function EmergencyLights({ positions }: { positions: [number, number, number][] }) {
  // Deux points seulement, aux tiers du wagon, quel que soit le palier de
  // qualité : ce n'est pas l'éclairage normal qu'on réduit, c'en est un autre.
  // Deux points seulement, aux tiers du wagon, quel que soit le palier de
  // qualité : ce n'est pas l'éclairage normal qu'on réduit, c'en est un autre.
  //
  // Ils sont posés VINGT CENTIMÈTRES sous le bandeau de plafond, là où les
  // néons sont collés dessous. Un point de lumière contre le plafond en fait un
  // panneau blanc, et une voiture au plafond blanc ne se lit pas comme une
  // voiture sur batteries : ce qu'on veut éclairer, c'est l'allée et le haut
  // des têtes, pas la tôle.
  const spots = useMemo<[number, number, number][]>(
    () => [
      [0, 1.96, positions.length > 1 ? -5.6 : 0],
      [0, 1.96, 5.6],
    ],
    [positions.length],
  );
  const lamps = useRef<(THREE.PointLight | null)[]>([]);
  useFrame(() => {
    const on = runtime.emergencyLight;
    for (const l of lamps.current) if (l) l.intensity = EMERGENCY_LAMP * on;
  });
  return (
    <>
      {spots.map((pos, i) => (
        <pointLight
          key={`em${i}`}
          ref={(l) => {
            lamps.current[i] = l;
          }}
          position={pos}
          intensity={0}
          distance={5.5}
          decay={1.9}
          color="#dbe6f0"
        />
      ))}
    </>
  );
}

export function Scene() {
  // Palier issu de la qualité vidéo choisie par le joueur (voir systems/perf) :
  // ne change qu'à un réglage manuel, donc quelques re-renders par session.
  const quality = usePerf((s) => s.quality);
  const perfLevel = qualityLevel(quality);
  // Le mode Extraordinaire partage le palier 0 d'Ultra : mêmes ombres, même
  // densité, mêmes néons. Ce qui change est ENTIÈREMENT dans la chaîne de
  // rendu, et le moteur n'est déjà plus le même à ce point du fichier.
  const webgpu = quality === 'extraordinary' && gpuKit() !== null;

  // Palier 2 : néons du wagon espacés (un pointLight sur deux) ; palier 4 :
  // deux seulement - à chaque fois légèrement poussés pour garder une
  // luminosité d'ensemble comparable.
  const lampPositions = perfLevel >= 4
    ? [LAMP_POSITIONS[1], LAMP_POSITIONS[3]]
    : perfLevel >= 2
      ? LAMP_POSITIONS.filter((_, i) => i % 2 === 0)
      : LAMP_POSITIONS;
  const lampIntensity = perfLevel >= 4 ? 4.2 : perfLevel >= 2 ? 3.6 : 3.0;

  return (
    <>
      <color attach="background" args={['#bcdaee']} />
      <fog attach="fog" args={['#d6e8f2', 45, 520]} />
      <AdaptiveDpr level={perfLevel} />
      <EnvironmentMap />
      <ShadowFlags />
      <DayNightLighting level={perfLevel} />
      <StationProbe />

      {/* Intérieur : chapelet de points blanc chaud sous le bandeau plafond. */}
      <CabinLights positions={lampPositions} intensity={lampIntensity} />

      {/* Lampes de secours : elles n'existent QUE dans le noir. */}
      <EmergencyLights positions={lampPositions} />

      {webgpu ? (
        <WebGPUEffects />
      ) : perfLevel < 2 ? (
        <EffectComposer>
          {/* Occlusion ambiante. C'est ce qui sépare une image de synthèse d'une
              photo : le noircissement des angles, sous les banquettes, derrière
              les mains courantes, dans les feuillures de porte. Les maquettes
              photogrammétriques l'ont cuite dans leurs textures ; ici elle est
              calculée, donc elle suit le cycle jour / nuit et les portes qui
              s'ouvrent. Rayon court (25 cm) : on cherche les contacts, pas un
              assombrissement général du wagon. */}
          <N8AO
            aoRadius={0.55}
            distanceFalloff={0.8}
            intensity={4.5}
            quality="medium"
            halfRes
            depthAwareUpsampling
            color="#1b2028"
          />
          <Bloom intensity={CONFIG.bloom} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.05} />
          <Vignette eskil={false} offset={0.32} darkness={0.42} />
        </EffectComposer>
      ) : perfLevel < 4 ? (
        /* Paliers 2-3 : l'occlusion ambiante (le post-effet le plus coûteux)
           est coupée et le multisampling réduit ; le reste de l'étalonnage est
           conservé pour ne pas changer la signature visuelle du jeu. */
        <EffectComposer multisampling={2}>
          <Bloom intensity={CONFIG.bloom} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.05} />
          <Vignette eskil={false} offset={0.32} darkness={0.42} />
        </EffectComposer>
      ) : null /* Paliers 4-5 : rendu direct, aucun post-processing - le tone
           mapping filmique par défaut du renderer prend le relais. */}
    </>
  );
}
