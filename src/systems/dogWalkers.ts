// Chiens promenés sur le quai.
//
// Une part des PROMENEURS de la foule (systems/platformCrowd, rôle « walker »
// — ceux qui arpentent le quai sans prendre le train) tient un chien en
// laisse. C'est volontairement rare : à Tokyo l'animal doit voyager en sac de
// transport, et ce qu'on croise sur un quai, c'est quelqu'un qui traverse la
// gare avec son chien, pas un wagon plein de bergers allemands. Un promeneur
// qui tient un chien ne monte donc JAMAIS en rame (voir crowdSendBoarder) : il
// repart par l'escalier, et son chien descend derrière lui.
//
// Le chien n'est pas collé à un point derrière son maître : il vise une place
// à ses côtés — du côté du MUR, jamais du côté de la voie — la dépasse, se
// laisse distancer, plante son museau au sol, puis trotte pour rattraper. La
// laisse borne tout ça : au-delà de sa longueur, le chien est ramené, et un
// reniflage est écourté quand la sangle se tend. C'est cette contrainte, plus
// que l'animation, qui donne la promenade.
//
// Une niche par variante du pack (characters/animals) : deux chiens à l'écran
// ne sont jamais de la même race, et le rendu n'a qu'un clone par race à
// tenir. Sans pack animalier installé, `breedCount` reste à zéro et rien de
// tout ceci ne tourne.

import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { PSD_X, STAIR_LANDING_Y } from '../data/stationGeometry';
import { useStore } from '../store';
import { rng } from '../textures/procedural';
import { paxScale } from './perf';
import { crowdBounds, crowdFloorY, crowdList, CROWD_WALK_SPEED, type CrowdPax } from './platformCrowd';
import { runtime } from './runtime';

/**
 * `move` ne dit pas QUEL cycle jouer : marche ou trot se choisit au rendu, en
 * comparant la vitesse réelle aux vitesses d'AUTEUR des clips du pack
 * (characters/animals). Les packs animaliers animent des foulées courtes — le
 * « Walk » d'un shiba vaut 0,24 m/s — et un seuil écrit en dur dans la
 * simulation aurait fait marcher au pas un chien qui court après son maître.
 */
export type DogGait = 'idle' | 'move' | 'sniff' | 'sit';

/** Longueur de la sangle : au-delà, le chien est rappelé. */
export const LEASH_LENGTH = 1.5;
/** Écart latéral visé en promenade (côté opposé à la voie). */
const SIDE_OFFSET = 0.55;
/** Recul visé derrière le maître, en promenade. */
const TRAIL = 0.28;
/** En transit (escalier, traversée) le chien se met dans les pas du maître. */
const TRANSIT_SIDE = 0.16;
const TRANSIT_TRAIL = 0.7;
/**
 * Vitesse de pointe : un chien rattrape plus vite qu'on ne marche, mais on ne
 * le lance pas au sprint — au-delà, aucun cycle du pack ne suit sans que les
 * pattes patinent (les foulées des packs animaliers sont courtes).
 */
const DOG_TOP_SPEED = CONFIG.walkSpeed * 1.6;
/** Distance en deçà de laquelle le chien se contente de suivre au pas. */
const REACHED = 0.14;
/** Dégagement autour du joueur : on ne marche pas au travers d'un chien. */
const PLAYER_CLEARANCE = 0.5;
/** Altitude sous laquelle un chien qui descend l'escalier n'est plus vu du quai. */
const DOG_VANISH_Y = STAIR_LANDING_Y + 0.35;
/**
 * Part des promeneurs qui tiennent un chien, tirée par gare. Quatre à cinq
 * promeneurs par quai : à 0,12, un peu moins d'une gare sur deux voit un
 * maître, et comme un quai fait 224 m, on n'en croise pas la moitié. C'est le
 * « parfois » qu'on cherche — à 0,2, on tombait sur un chien à presque tous
 * les arrêts, ce qui n'est plus une rencontre.
 */
const DOG_SHARE = 0.12;

export interface DogWalk {
  /** Variante du pack animalier — égale à l'indice de la niche. */
  variant: number;
  /** Voyageur qui le promène, -1 quand la niche est libre. */
  owner: number;
  /** Position dans le repère du quai (celui de CrowdPax.pos). */
  pos: THREE.Vector3;
  /** Altitude du sol sous le chien : négative dans une trémie d'escalier. */
  y: number;
  yaw: number;
  /** Vitesse instantanée (m/s) : choisit l'allure et cale le cycle. */
  speed: number;
  gait: DogGait;
  /** Temps restant de l'arrêt en cours (reniflage, assise). */
  stopT: number;
  /** Délai avant le prochain arrêt. */
  nextStop: number;
  /** Côté du maître qui tient la laisse : 1 droite, -1 gauche (cf. pose.ts). */
  handSide: 1 | -1;
  /** Ancre de laisse (main du maître), publiée par le rendu, repère du quai. */
  hand: THREE.Vector3;
  /** Couleur de la sangle, prise sur le sac du maître. */
  leashColor: string;
  /** Horloge du flânage : le chien dérive devant, derrière, sur le côté. */
  wanderT: number;
  /** Le maître s'est enfoncé dans l'escalier : le chien finit la descente. */
  orphanT: number;
  /** Dernier cap suivi, pour terminer une descente sans maître. */
  dirX: number;
  dirZ: number;
}

export const dogWalks: DogWalk[] = [];

/** Nombre de races installées : 0 = pas de pack animalier, pas de chiens. */
let breedCount = 0;

function makeDog(variant: number): DogWalk {
  return {
    variant,
    owner: -1,
    pos: new THREE.Vector3(),
    y: 0,
    yaw: 0,
    speed: 0,
    gait: 'idle',
    stopT: 0,
    nextStop: 6,
    handSide: 1,
    hand: new THREE.Vector3(),
    leashColor: '#3a3632',
    wanderT: 0,
    orphanT: 0,
    dirX: 0,
    dirZ: 1,
  };
}

/**
 * Déclaré par le rendu quand le pack animalier est chargé (et remis à zéro au
 * démontage). C'est le seul interrupteur : sans races, aucun chien n'existe.
 */
export function setDogBreedCount(n: number): void {
  breedCount = Math.max(0, n);
  while (dogWalks.length < breedCount) dogWalks.push(makeDog(dogWalks.length));
  for (const d of dogWalks) if (d.variant >= breedCount) release(d);
}

/** Chien tenu par ce voyageur du quai, ou null. */
export function dogOfPax(paxId: number): DogWalk | null {
  for (let i = 0; i < breedCount; i++) {
    if (dogWalks[i].owner === paxId) return dogWalks[i];
  }
  return null;
}

function release(dog: DogWalk): void {
  if (dog.owner >= 0) {
    const owner = crowdList[dog.owner];
    if (owner) {
      owner.hasDog = false;
      // Sans ça, un maître rendu en plein arrêt reste figé deux secondes.
      owner.holdWalk = 0;
    }
  }
  dog.owner = -1;
  dog.orphanT = 0;
  dog.speed = 0;
  dog.stopT = 0;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Outil dev : __dogs donne l'état de chaque chien (maître, allure, laisse).
  (window as unknown as Record<string, unknown>).__dogs = dogWalks;
}

// --- Recrutement ----------------------------------------------------------

/** Un chien à l'écran coûte un squelette animé de plus : deux au maximum. */
function maxDogs(): number {
  const s = paxScale();
  if (s < 0.5) return 0;
  return Math.min(breedCount, s >= 0.85 ? 2 : 1);
}

/**
 * Ce promeneur-ci sort-il son chien dans CETTE gare ? Le tirage mêle
 * l'identifiant du voyageur et la gare : la foule du quai est toujours faite
 * des mêmes personnes (leur apparence vient de leur identifiant), et sans la
 * gare dans la graine le même passant promènerait le même chien aux trente
 * arrêts de la boucle.
 */
function walksDogHere(paxId: number, stationIndex: number): boolean {
  return rng(41000 + paxId * 2654435761 + stationIndex * 7919)() < DOG_SHARE;
}

/**
 * Un chien ne doit jamais apparaître sous les yeux du joueur. Trois fenêtres :
 * le quai encore lointain (la foule vient d'être semée), un maître qui monte
 * de la trémie d'escalier — il arrive avec son chien, ce qui est précisément
 * ce qu'on veut voir — ou un maître assez loin sur le quai, qui aura le temps
 * de remonter jusqu'à nous.
 *
 * La seule fenêtre « quai lointain » ne suffisait pas : la foule est semée au
 * freinage, quand le quai est déjà là, et aucun chien ne sortait jamais.
 */
function canAppear(owner: CrowdPax): boolean {
  if (owner.state === 'arriving' || runtime.platformFade < 0.5) return true;
  // Référence : le joueur s'il est descendu, sinon le milieu de la rame — un
  // quai fait 224 m, il en reste beaucoup hors de portée du regard.
  const onPlatform = runtime.playerFrame === 'platform';
  const refX = onPlatform ? runtime.playerPlatX : PSD_X;
  const refZ = onPlatform ? runtime.playerPlatZ : 0;
  return Math.hypot(owner.pos.x - refX, owner.pos.z - refZ) > 24;
}

function eligible(p: CrowdPax): boolean {
  // `staff` : l'agent de quai a sa place réservée dans le pool et un travail —
  // il ne promène pas un chien en uniforme.
  if (p.staff || p.role !== 'walker' || p.hasDog) return false;
  return p.state === 'patrolling' || p.state === 'ambling' || p.state === 'waiting' || p.state === 'arriving';
}

function attach(dog: DogWalk, owner: CrowdPax): void {
  dog.owner = owner.id;
  owner.hasDog = true;
  dog.orphanT = 0;
  dog.stopT = 0;
  dog.nextStop = 4 + Math.random() * 8;
  dog.gait = 'move';
  dog.speed = 0;
  dog.wanderT = Math.random() * 20;
  dog.yaw = owner.yaw;
  dog.leashColor = owner.appearance.bagColor;
  // Posé directement à sa place : le maître vient d'apparaître lui aussi.
  aimTarget(dog, owner, tmpTarget);
  dog.pos.set(tmpTarget.x, 0, tmpTarget.z);
  dog.y = crowdFloorY(dog.pos.x, dog.pos.z);
  dog.hand.set(owner.pos.x, 1.0, owner.pos.z);
}

// --- Simulation -----------------------------------------------------------

const tmpTarget = new THREE.Vector3();

/**
 * Place visée par le chien : à côté du maître, DU CÔTÉ DU MUR (x croissant
 * dans le repère du quai — la voie est en x décroissant), un peu en retrait.
 * En transit, l'écart latéral se referme : dans une volée d'escalier on marche
 * dans les pas de son maître, pas à côté de lui.
 */
function aimTarget(dog: DogWalk, owner: CrowdPax, out: THREE.Vector3): THREE.Vector3 {
  const transit = owner.state === 'arriving' || owner.state === 'leaving';
  // Le flânage : la place visée dérive lentement devant, derrière et sur le
  // côté. Sans elle le chien se colle à un point fixe et la promenade devient
  // un remorquage — c'est ce qui distingue un chien d'une remorque.
  const wanderLead = transit ? 0 : Math.sin(dog.wanderT * 0.55) * 0.34;
  const wanderSide = transit ? 0 : Math.sin(dog.wanderT * 0.37 + 1.7) * 0.16;
  const side = (transit ? TRANSIT_SIDE : SIDE_OFFSET) + wanderSide;
  const trail = (transit ? TRANSIT_TRAIL : TRAIL) - wanderLead;
  // Repère du maître : il regarde (sin yaw, cos yaw), sa gauche est (cos yaw,
  // -sin yaw) — même convention que characters/pose (+X = gauche du PNJ).
  const fx = Math.sin(owner.yaw);
  const fz = Math.cos(owner.yaw);
  const lx = Math.cos(owner.yaw);
  const lz = -Math.sin(owner.yaw);
  // Le chien est du côté « mur » quoi qu'il arrive : c'est lx qui dit de quel
  // côté du maître ça tombe, et donc quelle main tient la laisse.
  const toWall = lx >= 0 ? 1 : -1;
  dog.handSide = toWall > 0 ? -1 : 1;
  out.set(
    owner.pos.x + lx * side * toWall - fx * trail,
    0,
    owner.pos.z + lz * side * toWall - fz * trail,
  );
  return out;
}

/** Le maître est-il en marche ? (les transits ont un délai de départ) */
function ownerMoving(owner: CrowdPax): boolean {
  const transit = owner.state === 'arriving' || owner.state === 'leaving' || owner.state === 'boarding';
  return owner.state === 'patrolling' || owner.state === 'ambling' || (transit && owner.delay <= 0);
}

function stepDog(dog: DogWalk, owner: CrowdPax | null, dt: number): void {
  const moving = owner ? ownerMoving(owner) : true;
  dog.wanderT += dt;
  if (owner) {
    aimTarget(dog, owner, tmpTarget);
  } else {
    // Maître disparu dans l'escalier : le chien finit la descente sur son cap.
    tmpTarget.set(dog.pos.x + dog.dirX * 3, 0, dog.pos.z + dog.dirZ * 3);
  }

  // — Arrêts : museau au sol, ou assise quand le maître s'éternise —
  if (dog.stopT > 0) {
    dog.stopT -= dt;
    // La sangle a le dernier mot : elle interrompt le meilleur des reniflages.
    if (dog.hand.distanceTo(dog.pos) > LEASH_LENGTH * 0.82) dog.stopT = 0;
  } else if (owner) {
    dog.nextStop -= dt;
    if (dog.nextStop <= 0 && dog.pos.distanceTo(tmpTarget) < 0.5) {
      // Un maître à l'arrêt laisse renifler plus longtemps, et parfois le
      // chien s'assied — c'est ce qu'on voit d'un quai où l'on attend.
      const still = !moving;
      dog.stopT = still ? 3 + Math.random() * 6 : 1.4 + Math.random() * 2;
      dog.gait = still && Math.random() < 0.35 ? 'sit' : 'sniff';
      dog.nextStop = (still ? 6 : 10) + Math.random() * 14;
      // Le maître s'arrête AVEC lui : c'est ce temps suspendu à deux, plus
      // que l'animation, qui fait la promenade. Il repart avant le chien —
      // le petit rappel de laisse que fait tout promeneur pressé.
      if (!still && owner) owner.holdWalk = dog.stopT * 0.8;
    }
  }

  // — Déplacement : viser la place, à une vitesse qui dépend de l'écart —
  let vx = 0;
  let vz = 0;
  if (dog.stopT <= 0) {
    const dx = tmpTarget.x - dog.pos.x;
    const dz = tmpTarget.z - dog.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > REACHED) {
      // L'allure du maître est reprise en ANTICIPATION, l'écart n'est qu'une
      // correction par-dessus. Sans ce terme, le chien poursuit une place qui
      // avance aussi vite que lui : il se stabilise un demi-mètre en arrière,
      // pour toujours, et ne s'arrête plus jamais renifler.
      const lead = moving ? CROWD_WALK_SPEED : 0;
      const want = Math.min(DOG_TOP_SPEED, Math.max(0.35, lead + dist * 2.4));
      const k = Math.min(1, dt * 6);
      dog.speed += (want - dog.speed) * k;
      const step = Math.min(dist, dog.speed * dt);
      vx = (dx / dist) * step;
      vz = (dz / dist) * step;
      dog.pos.x += vx;
      dog.pos.z += vz;
      dog.dirX = dx / dist;
      dog.dirZ = dz / dist;
    } else {
      dog.speed *= Math.max(0, 1 - dt * 5);
    }
  } else {
    dog.speed *= Math.max(0, 1 - dt * 8);
  }

  // — Le maître qui attend REGARDE son chien, tête baissée vers lui —
  if (owner && owner.holdWalk > 0) {
    let rel = Math.atan2(dog.pos.x - owner.pos.x, dog.pos.z - owner.pos.z) - owner.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const k = Math.min(1, dt * 4);
    owner.lookYaw += (THREE.MathUtils.clamp(rel, -0.9, 0.9) - owner.lookYaw) * k;
    owner.headPitch += (0.34 - owner.headPitch) * k;
  }

  // — Le joueur ne traverse pas un chien : il l'écarte —
  if (runtime.playerFrame === 'platform') {
    const px = dog.pos.x - runtime.playerPlatX;
    const pz = dog.pos.z - runtime.playerPlatZ;
    const d = Math.hypot(px, pz);
    if (d < PLAYER_CLEARANCE && d > 1e-4) {
      const push = (PLAYER_CLEARANCE - d) / d;
      dog.pos.x += px * push;
      dog.pos.z += pz * push;
      // On ne renifle pas tranquillement quand on se fait marcher dessus.
      if (dog.stopT > 0) dog.stopT = 0;
    }
  }

  // — Le chien reste SUR le quai : la promenade ne déborde ni dans la voie ni
  // dans le mur de fond. En transit, l'abscisse z est laissée libre : c'est
  // par là qu'on s'enfonce dans la trémie d'escalier, hors des bornes.
  const b = crowdBounds();
  dog.pos.x = THREE.MathUtils.clamp(dog.pos.x, b.x0, b.x1);
  const transit = owner ? owner.state === 'arriving' || owner.state === 'leaving' : true;
  if (!transit) dog.pos.z = THREE.MathUtils.clamp(dog.pos.z, b.z0, b.z1);

  // — Contrainte de laisse : rien ne dépasse la longueur de la sangle —
  // (sans maître, il n'y a plus de sangle : l'ancre en mémoire retiendrait un
  // chien qui n'a plus qu'à finir sa volée de marches.)
  const hx = dog.pos.x - dog.hand.x;
  const hz = dog.pos.z - dog.hand.z;
  const hd = Math.hypot(hx, hz);
  if (owner && hd > LEASH_LENGTH && hd > 1e-4) {
    dog.pos.x = dog.hand.x + (hx / hd) * LEASH_LENGTH;
    dog.pos.z = dog.hand.z + (hz / hd) * LEASH_LENGTH;
  }

  // — Cap : celui de la marche, sinon celui du maître —
  let targetYaw = dog.yaw;
  const moved = Math.hypot(vx, vz);
  if (moved > 1e-4) {
    targetYaw = Math.atan2(vx, vz);
  } else if (dog.gait !== 'sniff' && owner) {
    targetYaw = owner.yaw;
  }
  let dy = targetYaw - dog.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  dog.yaw += dy * Math.min(1, dt * 7);

  // — Sol : les marches se descendent vraiment, comme pour la foule —
  dog.y = crowdFloorY(dog.pos.x, dog.pos.z);

  // — Allure —
  if (dog.stopT > 0) {
    // gait posé au démarrage de l'arrêt (sniff / sit), conservé tel quel.
  } else {
    dog.gait = dog.speed > 0.12 ? 'move' : 'idle';
  }
}

export function updateDogWalkers(dt: number): void {
  if (breedCount === 0) return;
  const stationIndex = useStore.getState().platformIndex;
  let active = 0;

  for (let i = 0; i < breedCount; i++) {
    const dog = dogWalks[i];
    if (dog.owner < 0 && dog.orphanT <= 0) continue;
    const owner = dog.owner >= 0 ? crowdList[dog.owner] : null;

    if (owner && owner.state === 'boarding') {
      // Ne devrait pas arriver (crowdSendBoarder écarte les maîtres) : par
      // sûreté, le chien est rendu plutôt que traîné dans la rame.
      release(dog);
      continue;
    }
    if (owner && owner.state === 'hidden') {
      // Parti par l'escalier : le chien finit la volée derrière lui.
      const descending = dog.y < -0.05;
      release(dog);
      if (!descending) continue;
      dog.orphanT = 2;
    }
    if (dog.owner < 0) {
      dog.orphanT -= dt;
      if (dog.orphanT <= 0 || dog.y <= DOG_VANISH_Y) {
        dog.orphanT = 0;
        continue;
      }
      stepDog(dog, null, dt);
      continue;
    }

    if (owner) {
      owner.hasDog = true;
      stepDog(dog, owner, dt);
      active++;
    }
  }

  // — Recrutement : au plus un maître de plus par image —
  if (active >= maxDogs()) return;
  for (let i = 0; i < breedCount; i++) {
    const dog = dogWalks[i];
    if (dog.owner >= 0 || dog.orphanT > 0) continue;
    for (const p of crowdList) {
      if (!eligible(p) || !walksDogHere(p.id, stationIndex) || !canAppear(p)) continue;
      attach(dog, p);
      return;
    }
    return;
  }
}
