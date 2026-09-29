// Le réalisateur : une vidéo verticale « un matin sur la Yamanote », jouée
// PAR LE JEU.
//
// Chaque plan est une petite partition : quelques étapes de mise en place
// (une par image, parce que certaines ne prennent effet qu'une fois que le
// joueur a réellement changé de repère), une condition « prêt à tourner », puis
// une fonction appelée à chaque image qui conduit le regard, le pas, la caméra
// libre et l'horloge. Le jeu fait le reste : les voyageurs, les portes, le
// freinage, la lumière du jour.
//
// Deux façons de le jouer :
//   · image par image, depuis `scripts/film/shoot.mjs` - l'horloge de la page
//     est virtuelle, chaque image dure exactement 1/30 s de jeu ;
//   · en direct dans un vrai navigateur (`?film`, puis `__film.play()` en
//     console) pour filmer l'écran avec un vrai GPU.
//
// Développement seulement : rien de ceci n'existe dans le build.

import * as THREE from 'three';
import { filmPilot } from './pilot';
import { useStore } from '../../store';
import { runtime } from '../../systems/runtime';
import { platformWait } from '../../systems/platformWait';
import { carToWorldZ, platformToWorld } from '../../systems/playerFrame';
import { input } from '../../systems/input';
import { SEAT_SLOTS, seatOccupant } from '../../systems/seats';
import { machineState } from '../../systems/machines';
import { freezeWeather, weather } from '../../systems/weather';
import { crowdTarget, seedPlatformCrowd } from '../../systems/platformCrowd';
import { consumeHeld } from '../../systems/interaction';
import { productById } from '../../data/products';
import { dwellDuration } from '../../systems/stationCycle';
import { DUSK, durOf } from './timeline';
import { lineScreenFrame, type LineScreenState } from '../../three/lineScreenCycle';

type V3 = [number, number, number];

interface Ctx {
  /** Temps du plan (s), 0 au premier photogramme retenu. */
  t: number;
  dt: number;
  camera: THREE.PerspectiveCamera;
}

interface Shot {
  name: string;
  /** Durée retenue (s). */
  dur: number;
  /** Ouverture verticale (°). En 9:16, 70° ne laissent que 43° de large. */
  fov?: number;
  /** Mise en place : une étape par image, avant de tourner. */
  steps: (() => void)[];
  /** Tant que faux, on continue de préparer (images non retenues). */
  ready?: () => boolean;
  /** Pendant la préparation, après les étapes (accélérer l'attente, etc.). */
  prep?: () => void;
  /** À chaque image retenue. */
  frame: (c: Ctx) => void;
}

// --- Outils ---------------------------------------------------------------

const w = () => window as unknown as Record<string, (...a: unknown[]) => unknown>;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Rampe lissée de 0 à 1 entre a et b. */
const ease = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mix3 = (a: V3, b: V3, k: number): V3 => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

/** Chemin par clés [instant, valeur] : tronçons lissés, tenue aux extrémités. */
function path3(t: number, keys: [number, V3][]): V3 {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return mix3(v0, v1, ease(t0, t1, t));
    }
  }
  return keys[keys.length - 1][1];
}

/** Un point du QUAI (x, y, z) en repère monde. */
function plat(p: V3): V3 {
  const o = { x: 0, z: 0 };
  platformToWorld(p[0], p[2], o);
  return [o.x, p[1], o.z];
}

/** Un point de la VOITURE (x, y, z) en repère monde. */
function car(p: V3): V3 {
  return [p[0], p[1], carToWorldZ(p[2])];
}

function freeCam(pos: V3 | null, target?: V3, roll = 0) {
  w().__freeCam(
    pos && target
      ? { x: pos[0], y: pos[1], z: pos[2], tx: target[0], ty: target[1], tz: target[2], roll }
      : null,
  );
}

/** Tourne le regard du joueur vers un point du monde. */
function aim(p: V3) {
  const e = filmPilot.eye;
  const dx = p[0] - e.x;
  const dy = p[1] - e.y;
  const dz = p[2] - e.z;
  filmPilot.yaw = Math.atan2(-dx, -dz);
  filmPilot.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}

/** Appuyer sur « E » : la visée décide de ce qui se passe. */
function act() {
  input.talkRequest = true;
}

/** Déclencheurs à usage unique, remis à zéro à chaque plan. */
const fired = new Set<string>();
function once(key: string, cond: boolean, fn: () => void) {
  if (cond && !fired.has(key)) {
    fired.add(key);
    fn();
  }
}

function clearSky(clockMin: number) {
  freezeWeather(true);
  Object.assign(weather, { kind: 'fair', episode: 'fair', cloud: 0.12, rain: 0, snow: 0, wet: 0, snowCover: 0, wind: 0.2 });
  runtime.clockMin = clockMin;
}

/** Rendre le joueur à sa voiture, debout dans l'allée : point de départ commun. */
function backInCar() {
  freeCam(null);
  filmPilot.active = true;
  filmPilot.goal = null;
  filmPilot.stand = true;
  filmPilot.place = { x: 0, z: carToWorldZ(4.2) };
  filmPilot.yaw = Math.PI;
  filmPilot.pitch = 0;
  platformWait.rate = 1;
}

interface CrowdPax {
  state: string;
  pos: { x: number; z: number };
  home: { x: number; z: number };
}

/** Rapproche des voyageurs qui attendent dans la tranche [z0, z1] du quai. */
function gatherCrowd(z0: number, z1: number, n: number) {
  const crowd = (window as unknown as { __crowd?: CrowdPax[] }).__crowd ?? [];
  const waiting = crowd.filter((p) => p.state === 'waiting' && (p.pos.z < z0 || p.pos.z > z1));
  let moved = 0;
  for (const p of waiting) {
    if (moved >= n) break;
    const mid = (z0 + z1) / 2;
    const shift = Math.round((mid - p.pos.z) / 20) * 20;
    const z = p.pos.z + shift;
    if (z < z0 || z > z1) continue;
    p.pos.z = z;
    p.home.z += shift;
    moved++;
  }
}

/**
 * Cale l'horloge sur le premier instant, à partir de `from`, où l'afficheur de
 * porte montre `state`. La rotation change d'écran tous les quarts de minute :
 * on se pose juste après le changement, pour tenir tout le plan.
 */
function clockForScreen(state: LineScreenState, from: number): number {
  for (let k = 0; k < 40; k++) {
    runtime.clockMin = Math.floor(from * 4 + k) / 4 + 0.01;
    if (lineScreenFrame().state === state) return runtime.clockMin;
  }
  runtime.clockMin = from;
  return from;
}

/** Nez de la rame (voiture 1, côté -z), en repère QUAI. */
function nosePlatZ(): number {
  const worldZ = carToWorldZ(-110);
  const flip = useStore.getState().doorSide;
  return (worldZ - runtime.platformSlide) * flip;
}

/** Le distributeur du quai de Shibuya qui sert au plan, et sa vitrine. */
const MACHINE = 'pv2';
function findPickable(scene: THREE.Scene, id: string, kind: string): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  scene.traverse((o) => {
    const a = o.userData.act as { id?: string; kind?: string } | undefined;
    if (!found && a?.id === id && a.kind === kind) found = o as THREE.Mesh;
  });
  return found;
}

/** Centre monde d'une case (col, row) d'un plan cliquable découpé en grille. */
function cellPoint(mesh: THREE.Mesh, col: number, row: number, cols: number, rows: number): V3 {
  mesh.geometry.computeBoundingBox();
  const b = mesh.geometry.boundingBox!;
  const u = (col + 0.5) / cols;
  const v = 1 - (row + 0.5) / rows;
  const p = new THREE.Vector3(mix(b.min.x, b.max.x, u), mix(b.min.y, b.max.y, v), 0);
  mesh.updateWorldMatrix(true, false);
  p.applyMatrix4(mesh.matrixWorld);
  return [p.x, p.y, p.z];
}

function centerOf(mesh: THREE.Mesh | null, fallback: V3): V3 {
  if (!mesh) return fallback;
  const p = mesh.getWorldPosition(new THREE.Vector3());
  return [p.x, p.y, p.z];
}

// --- Les plans -------------------------------------------------------------

/** Gare du tournage : Shibuya (JY20), sens intérieur. */
const SHIBUYA = 19;

let sceneRef: THREE.Scene | null = null;

/** Visées du distributeur, relevées au moment du plan. */
const vend = { ic: [0, 0, 0] as V3, cell: [0, 0, 0] as V3, tray: [0, 0, 0] as V3, glass: [0, 0, 0] as V3 };

/** Heure retenue pour le plan de l'afficheur (voir `clockForScreen`). */
let screenClock = 0;

/** Place assise du plan 4 : côté -x, face aux portes du quai. */
let seatIndex = -1;

const SHOTS: Shot[] = [
  // 1. L'accroche : la rame entre en gare, vue du quai où l'on attend.
  {
    name: 'arrivee',
    dur: durOf('arrivee'),
    fov: 62,
    steps: [
      backInCar,
      () => {
        clearSky(7 * 60 + 38);
        w().__jumpTo('dwell', Math.max(0, dwellDuration(SHIBUYA) - 4), SHIBUYA);
      },
      () => {
        // Descendre : la rame repart sans nous, et l'on attend la suivante.
        filmPilot.place = { x: 3.6, z: 30 };
        useStore.getState().setHeld(null);
      },
    ],
    prep: () => {
      // L'attente est longue : on la fait défiler, puis on laisse la rame
      // suivante freiner à sa vraie vitesse sur la fin.
      const approaching = platformWait.stage === 'approaching';
      platformWait.rate = approaching && nosePlatZ() < 160 ? 1 : 40;
      runtime.clockMin = 7 * 60 + 41;
      // L'attente accélérée ne laisse pas à la foule le temps de monter les
      // escaliers : on peuple le quai d'un coup, comme à l'heure de pointe.
      // Elle se répartit ensuite sur ses 224 m - à peine une silhouette dans le
      // champ : on en rapproche une quinzaine, décalées d'un multiple exact du
      // pas des voitures pour rester sur les marques d'attente d'une porte.
      once('crowd', approaching, () => {
        const n = Math.round(crowdTarget(SHIBUYA) * 1.2);
        seedPlatformCrowd(SHIBUYA, { total: n, walkers: Math.round(n * 0.1) });
      });
      once('gather', approaching && fired.has('crowd'), () => gatherCrowd(25, 52, 14));
    },
    ready: () => platformWait.stage === 'approaching' && nosePlatZ() < 47,
    frame: ({ t }) => {
      platformWait.rate = 1;
      // Caméra basse au bord du quai : la rame arrive de face, passe, et le
      // regard reste accroché à ses flancs qui défilent.
      const camZ = mix(22, 20.5, ease(0, durOf('arrivee'), t));
      const nose = nosePlatZ();
      const pos = plat([2.6, 1.32, camZ]);
      const look = plat([0.75, 1.4, Math.max(nose - 6, camZ + 7)]);
      freeCam(pos, look, 0.012);
    },
  },

  // 2. Le café du matin, au distributeur du quai.
  {
    name: 'distributeur',
    dur: durOf('distributeur'),
    fov: 70,
    steps: [
      backInCar,
      () => {
        clearSky(7 * 60 + 40);
        w().__jumpTo('dwell', 40, SHIBUYA);
        useStore.getState().setHeld(null);
      },
      () => {
        filmPilot.place = { x: 4.86, z: 19.2 };
      },
      () => {
        // Visées, lues sur les pièces telles qu'elles sont rendues.
        const scene = sceneRef!;
        const slot = findPickable(scene, MACHINE, 'vendSlot');
        vend.ic = centerOf(findPickable(scene, MACHINE, 'icPad'), [5.88, 0.73, 18.9]);
        vend.tray = centerOf(findPickable(scene, MACHINE, 'tray'), [5.84, 0.3, 19.18]);
        vend.glass = centerOf(slot, [5.9, 1.32, 19.18]);
        vend.cell = vend.glass;
        const s = machineState(MACHINE);
        const act0 = slot?.userData.act as { cols?: number; rows?: number } | undefined;
        if (slot && act0?.cols && act0.rows) {
          // Un café chaud, de préférence : c'est le matin.
          const coffee = s.slots.findIndex((p) => !!p && ['kohi-b', 'kohi-m', 'latte', 'espresso'].includes(p.id));
          const hot = coffee >= 0 ? coffee : s.slots.findIndex((p) => p?.hot && p.shape === 'canSlim');
          const any = s.slots.findIndex((p) => p !== null);
          const i = hot >= 0 ? hot : any;
          vend.cell = cellPoint(slot, i % act0.cols, Math.floor(i / act0.cols), act0.cols, act0.rows);
        }
      },
    ],
    prep: () => {
      aim(vend.glass);
    },
    frame: ({ t }) => {
      const look = path3(t, [
        [0.0, vend.glass],
        [0.7, vend.ic],
        [1.3, vend.ic],
        [1.8, vend.cell],
        [2.2, vend.cell],
        [2.75, vend.tray],
        [3.4, vend.tray],
        [3.9, [vend.glass[0], vend.glass[1] + 0.2, vend.glass[2]]],
      ]);
      aim(look);
      // On se penche vers le bac : il est hors de portée depuis la vitrine.
      filmPilot.pace = 0.5;
      filmPilot.goal = t >= 2.3 && t < 3.45 ? { x: 5.2, z: 19.2 } : { x: 4.86, z: 19.2 };
      once('ic', t >= 0.95, act);
      once('press', t >= 2.0, act);
      // La canette met une seconde à tomber : on ne la prend qu'une fois là.
      once('take', t >= 3.25, act);
    },
  },

  // 3. Monter : la porte ouverte, à pied - c'est le seul passage.
  {
    name: 'monter',
    dur: durOf('monter'),
    fov: 74,
    steps: [
      backInCar,
      () => {
        clearSky(7 * 60 + 42);
        w().__jumpTo('dwell', 3.2, SHIBUYA);
        const coffee = productById('kohi-b');
        if (coffee) useStore.getState().setHeld({ productId: coffee.id, sips: coffee.sips, maxSips: coffee.sips, opened: false });
      },
      () => {
        filmPilot.place = { x: 3.9, z: carToWorldZ(2.5) };
        filmPilot.yaw = Math.PI / 2;
      },
    ],
    frame: ({ t }) => {
      const doorZ = carToWorldZ(2.5);
      // On traverse le quai, puis le seuil, puis on se tourne vers l'allée.
      if (filmPilot.eye.x < 0.9) fired.add('inside');
      filmPilot.goal = fired.has('inside') ? { x: 0.1, z: doorZ - 1.6 } : { x: 0.2, z: doorZ };
      filmPilot.pace = 1;
      const look = path3(t, [
        [0.0, [0.4, 1.45, doorZ]],
        [1.6, [-1.6, 1.5, doorZ]],
        [2.8, [-0.2, 1.45, doorZ - 5]],
      ]);
      aim(look);
    },
  },

  // 4. Assis, le café, et la rame qui repart.
  {
    name: 'assis',
    dur: durOf('assis'),
    fov: 74,
    steps: [
      backInCar,
      () => {
        clearSky(7 * 60 + 43);
        w().__jumpTo('dwell', Math.max(0, dwellDuration(SHIBUYA) - 2.5), SHIBUYA);
        const coffee = productById('kohi-b');
        if (coffee) useStore.getState().setHeld({ productId: coffee.id, sips: coffee.sips, maxSips: coffee.sips, opened: false });
      },
      () => {
        // La place libre la plus proche du milieu de la voiture, de préférence
        // côté -x, face aux portes du quai.
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < SEAT_SLOTS.length; i++) {
          const s = SEAT_SLOTS[i];
          if (s.side !== -1 || seatOccupant[i] === 'player') continue;
          const d = Math.abs(s.z - 0.6);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        // À l'heure de pointe, pas une place de libre : celui qui l'occupait
        // descend à Shibuya.
        const occ = best >= 0 ? seatOccupant[best] : null;
        if (typeof occ === 'number') {
          const pax = (window as unknown as { __pax?: { id: number; state: string; seatSlot: number }[] }).__pax;
          const p = pax?.find((q) => q.id === occ);
          if (p) {
            p.state = 'hidden';
            p.seatSlot = -1;
          }
          seatOccupant[best] = null;
        }
        seatIndex = best;
        if (best >= 0) filmPilot.sit = best;
        const side = best >= 0 ? SEAT_SLOTS[best].side : -1;
        filmPilot.yaw = side === 1 ? Math.PI / 2 : -Math.PI / 2;
      },
    ],
    // Préparation longue : les portes se ferment, la rame démarre.
    ready: () => useStore.getState().phase === 'depart' && runtime.phaseT > 0.6,
    frame: ({ t }) => {
      const e = filmPilot.eye;
      // En face : la paroi opposée, ses vitres, et le quai qui s'en va.
      const side = seatIndex >= 0 ? SEAT_SLOTS[seatIndex].side : -1;
      const x = -side * 1.4;
      const look = path3(t, [
        [0.0, [x, 1.2, e.z + 0.35]],
        [1.1, [x, 1.05, e.z - 0.1]],
        [2.4, [x, 1.4, e.z - 0.2]],
        [3.8, [x, 1.5, e.z - 0.7]],
      ]);
      aim(look);
      // Boire directement : face à un voisin, « E » lui adresserait la parole.
      once('open', t >= 0.5, () => consumeHeld());
      once('sip', t >= 1.3, () => consumeHeld());
    },
  },

  // 5. L'écran au-dessus de la porte : la prochaine gare.
  {
    name: 'ecran',
    dur: durOf('ecran'),
    fov: 58,
    steps: [
      backInCar,
      () => {
        clearSky(7 * 60 + 46);
        w().__jumpTo('cruise', 30, SHIBUYA + 1);
      },
      () => {
        // Le plan de boucle : l'anneau vert de la ligne, la rame dessus.
        screenClock = clockForScreen('loopJP', 7 * 60 + 46);
      },
    ],
    frame: ({ t }) => {
      // De biais : de face, une poignée pend pile devant l'écran.
      const k = ease(0, durOf('ecran'), t);
      const pos = car([mix(0.15, 0.4, k), mix(1.72, 1.8, k), mix(3.62, 3.4, k)]);
      freeCam(pos, car([1.38, 2.02, 2.86]), -0.015);
    },
  },

  // 6. Par la vitre, la journée passe : le soir tombe sur la ville.
  {
    name: 'fenetre',
    dur: durOf('fenetre'),
    fov: 64,
    steps: [
      backInCar,
      () => {
        clearSky(DUSK.from);
        // Uguisudani → Nippori : le grand faisceau de voies, le ciel ouvert.
        w().__jumpTo('cruise', 25, 7);
      },
    ],
    frame: ({ t }) => {
      const k = ease(0, durOf('fenetre'), t);
      runtime.clockMin = mix(DUSK.from, DUSK.to, k);
      // Assez bas et tourné vers le haut pour que le ciel entre dans la vitre :
      // c'est lui qui dit l'heure.
      freeCam(car([mix(0.72, 0.86, k), 1.28, -2.5]), car([4, 2.25, -2.5 - mix(1.0, 1.5, k)]), 0);
    },
  },

  // 7. Le soir, dans la voiture : la lumière du plafond, la ville noire aux
  //    vitres, les téléphones. Fond du carton de fin.
  {
    name: 'soir',
    dur: durOf('soir'),
    fov: 66,
    steps: [
      backInCar,
      () => {
        clearSky(19 * 60 + 40);
        w().__jumpTo('cruise', 22, 17);
        useStore.getState().setHeld(null);
      },
    ],
    prep: () => {
      runtime.clockMin = 19 * 60 + 40;
    },
    frame: ({ t }) => {
      runtime.clockMin = 19 * 60 + 40;
      const k = ease(0, durOf('soir'), t);
      // Au bout de la voiture, dans l'axe de l'allée, qui avance doucement.
      freeCam(car([0.12, 1.66, mix(8.9, 7.9, k)]), car([0, 1.42, -9]), 0);
    },
  },
];

// --- La régie --------------------------------------------------------------

type Mode = 'idle' | 'prep' | 'roll';

const regie = {
  mode: 'idle' as Mode,
  shot: -1,
  step: 0,
  t: 0,
  /** Calques de la caméra, rendus au moment de tourner. */
  mask: 1,
  /** Masquer la préparation (tournage image par image). */
  hidePrep: true,
  /** Tourner sans rendre : seules les images demandées sont regardées. */
  blind: false,
  /** Images de chauffe déjà faites (voir `tick`). */
  warm: 0,
};

// Le fondu entre deux pages de l'afficheur dure 0,14 s (lineScreenAnim) : 8 images le couvrent.
const WARM_FRAMES = 8;

let styleEl: HTMLStyleElement | null = null;
function hideUi(on: boolean) {
  if (on && !styleEl) {
    styleEl = document.createElement('style');
    styleEl.textContent = '.app > :not(:first-child){display:none !important}';
    document.head.appendChild(styleEl);
  } else if (!on && styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

function tick(dt: number, camera: THREE.PerspectiveCamera) {
  if (regie.mode === 'idle') return;
  const shot = SHOTS[regie.shot];
  const fov = shot.fov ?? 70;
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  if (regie.mode === 'prep') {
    // Rien à voir pendant la mise en place : la caméra n'y regarde aucun
    // calque, ce qui rend ces images presque gratuites.
    if (regie.hidePrep) camera.layers.mask = 0;
    if (regie.step < shot.steps.length) {
      shot.steps[regie.step++]();
      return;
    }
    shot.prep?.();
    // Prêt : quelques images de chauffe, cadrées et rendues mais non
    // retenues. Certaines surfaces (l'afficheur de porte) ne se repeignent que
    // lorsqu'elles sont dans le champ : sans cela, la première image du plan
    // montrait encore l'écran d'il y a dix minutes.
    if (regie.warm > 0 || !shot.ready || shot.ready()) {
      regie.warm++;
      camera.layers.mask = regie.mask;
      shot.frame({ t: 0, dt: 0, camera });
    }
    return;
  }
  // Image aveugle : simulée mais pas rendue (planches de repérage).
  camera.layers.mask = regie.blind ? 0 : regie.mask;
  regie.t += dt;
  shot.frame({ t: regie.t, dt, camera });
}

function cut(i: number) {
  regie.shot = i;
  regie.step = 0;
  regie.t = 0;
  regie.warm = 0;
  regie.mode = 'prep';
  fired.clear();
  filmPilot.active = true;
  filmPilot.tick = tick;
  hideUi(true);
}

/** La préparation est-elle terminée ? */
function isReady(): boolean {
  if (regie.mode !== 'prep') return regie.mode === 'roll';
  const shot = SHOTS[regie.shot];
  if (regie.step < shot.steps.length) return false;
  return regie.warm >= WARM_FRAMES;
}

function roll() {
  regie.mode = 'roll';
  regie.t = 0;
  // Première image : la consigne de t = 0, posée tout de suite.
  const shot = SHOTS[regie.shot];
  shot.frame({ t: 0, dt: 0, camera: new THREE.PerspectiveCamera() });
}

function stop(camera?: THREE.PerspectiveCamera) {
  regie.mode = 'idle';
  filmPilot.active = false;
  filmPilot.tick = null;
  filmPilot.goal = null;
  freeCam(null);
  freezeWeather(false);
  platformWait.rate = 1;
  hideUi(false);
  if (camera) {
    camera.fov = 70;
    camera.updateProjectionMatrix();
  }
}

/** En direct, dans un vrai navigateur : tous les plans à la suite. */
async function play(from = 0, to = SHOTS.length - 1) {
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  for (let i = from; i <= to; i++) {
    cut(i);
    let guard = 0;
    while (!isReady() && guard++ < 20000) await frame();
    roll();
    const t0 = performance.now();
    while (performance.now() - t0 < SHOTS[i].dur * 1000) await frame();
  }
  stop();
}

export function installFilm(scene: THREE.Scene): () => void {
  sceneRef = scene;
  const win = window as unknown as Record<string, unknown>;
  win.__film = {
    shots: SHOTS.map((s) => ({ name: s.name, dur: s.dur })),
    cut,
    isReady,
    roll,
    blind: (on: boolean) => {
      regie.blind = on;
    },
    stop,
    play,
    state: () => ({
      ...regie,
      stage: platformWait.stage,
      waitT: +platformWait.t.toFixed(2),
      phase: useStore.getState().phase,
      phaseT: +runtime.phaseT.toFixed(2),
      frame: runtime.playerFrame,
      nose: +nosePlatZ().toFixed(1),
      held: useStore.getState().held,
      seat: seatIndex,
      screen: { clock: +screenClock.toFixed(2), state: lineScreenFrame().state },
      machine: { ...machineState(MACHINE), slots: undefined },
    }),
  };
  return () => {
    delete win.__film;
    sceneRef = null;
  };
}
