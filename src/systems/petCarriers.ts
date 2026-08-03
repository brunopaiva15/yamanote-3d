// Chiens en caisse de transport sur le quai.
//
// C'est la SEULE façon dont un chien peut légalement se trouver là. Les règles
// de JR East l'imposent : l'animal doit être entièrement enfermé, sans sortir
// la tête, dans une caisse dont la somme des trois cotes ne dépasse pas 120 cm
// et dont le poids total, animal compris, reste sous 10 kg - et son maître
// prend pour lui un billet « bagage à main » à 290 ¥. Un chien tenu en laisse,
// porté dans les bras, glissé dans une écharpe ou promené en poussette est
// explicitement interdit à l'intérieur des portiques.
//
// Ce module ne simule donc rien : la caisse est portée à bout de bras et suit
// son porteur, point. Il ne fait que DÉSIGNER qui en porte une, et de quelle
// main - le rendu (three/PlatformPets) accroche le reste à l'os de la main.
//
// Corollaire agréable : contrairement à un chien en laisse, un chien en caisse
// MONTE dans le train. Le porteur est un voyageur comme un autre, et rien dans
// la foule du quai n'a besoin de le savoir.

import { Vec3 } from './vec3';
import { PSD_X } from '../data/stationGeometry';
import { useStore } from '../store';
import { rng } from '../data/rng';
import { crowdList, type CrowdPax } from './platformCrowd';
import { runtime } from './runtime';

/**
 * Part des voyageurs tirés au sort par gare. Le filtre d'apparition ci-dessous
 * ne laisse passer, quai visible, que les promeneurs et ceux qui montent de
 * l'escalier - soit une poignée de personnes par gare, pas la douzaine
 * présente. D'où une part plus haute qu'il n'y paraît pour un résultat qui
 * reste rare : une gare sur trois environ voit passer une caisse, quelque part
 * sur ses 224 m, et on n'en croise pas la moitié.
 */
const PET_SHARE = 0.055;

export interface PetCarrier {
  /** Race du pack animalier - égale à l'indice de la niche. */
  variant: number;
  /** Voyageur qui la porte, -1 quand la niche est libre. */
  owner: number;
  /** Main qui tient la poignée : 1 droite, -1 gauche (cf. characters/pose). */
  handSide: 1 | -1;
  /** Position de cette main, publiée par le rendu de la foule (repère quai). */
  handPos: Vec3;
  /** Faux tant que le rendu n'a pas publié la main : rien à afficher. */
  handSet: boolean;
  /** Teinte de la coque : celle du sac du porteur, pour que ça aille ensemble. */
  color: string;
}

export const petCarriers: PetCarrier[] = [];

/** Nombre de races installées : 0 = pas de pack animalier, pas de chiens. */
let breedCount = 0;

function makeCarrierSlot(variant: number): PetCarrier {
  return {
    variant,
    owner: -1,
    handSide: 1,
    handPos: new Vec3(),
    handSet: false,
    color: '#8a9a86',
  };
}

/**
 * Déclaré par le rendu quand le pack animalier est chargé (et remis à zéro au
 * démontage). C'est le seul interrupteur : sans races, aucun chien n'existe.
 */
export function setPetBreedCount(n: number): void {
  breedCount = Math.max(0, n);
  while (petCarriers.length < breedCount) petCarriers.push(makeCarrierSlot(petCarriers.length));
  for (const c of petCarriers) if (c.variant >= breedCount) release(c);
}

/** Caisse portée par ce voyageur du quai, ou null. */
export function carrierOfPax(paxId: number): PetCarrier | null {
  for (let i = 0; i < breedCount; i++) {
    if (petCarriers[i].owner === paxId) return petCarriers[i];
  }
  return null;
}

function release(carrier: PetCarrier): void {
  carrier.owner = -1;
  carrier.handSet = false;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Outil dev : __pets donne l'état de chaque caisse (porteur, main).
  (window as unknown as Record<string, unknown>).__pets = petCarriers;
}

/**
 * Ce voyageur-ci voyage-t-il avec son chien dans CETTE gare ? Le tirage mêle
 * son identité et la gare : la foule du quai est toujours faite des mêmes
 * personnes (leur apparence vient de leur identité), et sans la gare dans la
 * graine le même passant transporterait le même chien aux trente arrêts.
 *
 * C'est bien l'identité et non la place du pool : celle-ci change de main à
 * chaque montée (systems/platformCrowd), la caisse suivrait alors le siège du
 * quai au lieu de suivre son maître.
 */
function carriesPetHere(identity: number, stationIndex: number): boolean {
  return rng(41000 + identity * 2654435761 + stationIndex * 7919)() < PET_SHARE;
}

/**
 * Une caisse ne doit jamais apparaître sous les yeux du joueur. Trois
 * fenêtres : le quai encore lointain (la foule vient d'être semée), un porteur
 * qui monte de la trémie d'escalier - il arrive avec son chien, ce qui est
 * précisément ce qu'on veut voir - ou un porteur assez loin sur le quai.
 */
function canAppear(owner: CrowdPax): boolean {
  if (owner.state === 'arriving' || runtime.platformFade < 0.5) return true;
  const onPlatform = runtime.playerFrame === 'platform';
  const refX = onPlatform ? runtime.playerPlatX : PSD_X;
  const refZ = onPlatform ? runtime.playerPlatZ : 0;
  return Math.hypot(owner.pos.x - refX, owner.pos.z - refZ) > 24;
}

function eligible(p: CrowdPax): boolean {
  // `staff` : l'agent de quai a sa place réservée dans le pool et un travail.
  if (p.staff) return false;
  return p.state === 'waiting' || p.state === 'ambling' || p.state === 'patrolling' || p.state === 'arriving';
}

/**
 * Assignation seulement - aucun mouvement à intégrer : la caisse est portée.
 * Appelé après la foule du quai (three/Engine), dont il lit les états.
 */
export function updatePetCarriers(): void {
  if (breedCount === 0) return;
  const stationIndex = useStore.getState().platformIndex;
  let free = -1;
  const taken = new Set<number>();

  for (let i = 0; i < breedCount; i++) {
    const carrier = petCarriers[i];
    const owner = carrier.owner >= 0 ? crowdList[carrier.owner] : null;
    // Le porteur disparaît : par l'escalier, ou dans la rame avec son chien.
    if (!owner || owner.state === 'hidden') {
      release(carrier);
    } else {
      taken.add(owner.id);
      continue;
    }
    if (free < 0) free = i;
  }
  if (free < 0) return;

  for (const p of crowdList) {
    if (taken.has(p.id) || !eligible(p) || !carriesPetHere(p.identity, stationIndex) || !canAppear(p)) continue;
    const carrier = petCarriers[free];
    carrier.owner = p.id;
    carrier.handSet = false;
    // La main libre est tirée avec le voyageur : il la garde d'un quai à
    // l'autre, et les gestes du catalogue partent dans l'autre bras.
    carrier.handSide = rng(52000 + p.identity * 2654435761)() < 0.6 ? 1 : -1;
    carrier.color = p.appearance.bagColor;
    return;
  }
}
