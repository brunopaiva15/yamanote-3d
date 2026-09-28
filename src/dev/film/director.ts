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
import { productById } from '../../data/products';
import { dwellDuration } from '../../systems/stationCycle';
import { DUSK, durOf } from './timeline';

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
      },
    ],
    prep: () => {
      // L'attente est longue : on la fait défiler, puis on laisse la rame
      // suivante freiner à sa vraie vitesse sur la fin.
      const approaching = platformWait.stage === 'approaching';
      platformWait.rate = approaching && nosePlatZ() < 160 ? 1 : 40;
      runtime.clockMin = 7 * 60 + 41;
    },
    ready: () => platformWait.stage === 'approaching' && nosePlatZ() < 86,
    frame: ({ t }) => {
      platformWait.rate = 1;
      // Caméra basse au bord du quai, qui accompagne le nez de la rame.
      const nose = nosePlatZ();
      const pos = plat([2.75, 1.25, mix(24, 21, ease(0, 2.8, t))]);
      const look = plat([0.7, 1.55, Math.max(nose - 4, 0)]);
      freeCam(pos, look, 0.015);
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
        filmPilot.place = { x: 5.02, z: 19.2 };
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
          const hot = s.slots.findIndex((p) => p?.hot && p.shape === 'canSlim');
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
        [2.8, vend.tray],
        [3.15, vend.tray],
        [3.7, [vend.glass[0], vend.glass[1] + 0.25, vend.glass[2]]],
      ]);
      aim(look);
      once('ic', t >= 0.95, act);
      once('press', t >= 2.0, act);
      once('take', t >= 3.0, act);
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
        // Côté -x, face aux portes du quai : la place libre la plus proche du
        // milieu de la voiture.
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < SEAT_SLOTS.length; i++) {
          const s = SEAT_SLOTS[i];
          if (s.side !== -1 || seatOccupant[i] !== null) continue;
          const d = Math.abs(s.z - 0.6);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        seatIndex = best;
        if (best >= 0) filmPilot.sit = best;
        filmPilot.yaw = -Math.PI / 2;
      },
    ],
    // Préparation longue : les portes se ferment, la rame démarre.
    ready: () => useStore.getState().phase === 'depart' && runtime.phaseT > 0.6,
    frame: ({ t }) => {
      const e = filmPilot.eye;
      const across: V3 = [1.4, 1.45, e.z + 0.2];
      const down: V3 = [e.x + 0.55, e.y - 0.55, e.z - 0.18];
      const look = path3(t, [
        [0.0, across],
        [0.8, down],
        [2.0, down],
        [2.8, [1.4, 1.5, e.z - 0.9]],
      ]);
      aim(look);
      once('open', t >= 1.0, act);
      once('sip', t >= 1.6, act);
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
    ],
    frame: ({ t }) => {
      const k = ease(0, 2.4, t);
      const pos = car([mix(-0.5, -0.05, k), mix(1.66, 1.74, k), 2.5 + mix(0.35, 0.25, k)]);
      freeCam(pos, car([1.35, 2.03, 2.83]), -0.01);
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
        w().__jumpTo('cruise', 25, 16);
      },
    ],
    frame: ({ t }) => {
      const k = ease(0, durOf('fenetre'), t);
      runtime.clockMin = mix(DUSK.from, DUSK.to, k);
      freeCam(car([mix(0.55, 0.75, k), 1.5, -2.5]), car([4, 1.35, -2.5 - mix(0.9, 1.3, k)]), 0);
    },
  },

  // 7. Le soir, sur le quai : la rame repart, et l'on rentre à pied.
  {
    name: 'soir',
    dur: durOf('soir'),
    fov: 62,
    steps: [
      backInCar,
      () => {
        clearSky(19 * 60 + 12);
        w().__jumpTo('dwell', Math.max(0, dwellDuration(SHIBUYA) - 4), SHIBUYA);
      },
      () => {
        filmPilot.place = { x: 3.6, z: 8 };
      },
    ],
    prep: () => {
      runtime.clockMin = 19 * 60 + 12;
    },
    ready: () => platformWait.stage === 'departing' && platformWait.t > 1.5,
    frame: ({ t }) => {
      const k = ease(0, 3.4, t);
      freeCam(plat([mix(3.1, 3.4, k), 1.5, mix(-2, -8, k)]), plat([0.9, 1.35, -60]), 0.01);
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
};

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
  return shot.ready ? shot.ready() : true;
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
      machine: { ...machineState(MACHINE), slots: undefined },
    }),
  };
  return () => {
    delete win.__film;
    sceneRef = null;
  };
}
