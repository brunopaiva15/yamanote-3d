// Montage des chutes.
//
// Jusqu'ici, tomber n'était qu'une ROTATION : le groupe du personnage basculait
// autour de son bassin, corps raide, jambes tendues dans la pose debout, et
// remontait à l'endroit à la fin. De loin ça passait ; d'un mètre, un voyageur
// « tombait » comme une planche à repasser.
//
// Les packs livrent pourtant de vraies animations clés à clés - un corps qui
// perd ses jambes, s'assoit sur ses talons, part en arrière et s'étale, avec le
// contrecoup des bras et le tassement final. C'est le clip « Death » (résolu en
// `collapse`, voir library.ts) ; le « HitRecieve » (`stagger`) est, lui, le faux
// pas complet : buste plié, pied qui recule, redressement.
//
// Ce module MONTE ces clips au lieu de les jouer bêtement : chaque chute est
// une piste de clés [temps de l'action → position dans le clip] que le rendu
// applique en scrubbant le clip (`action.time`, clip en pause). On y gagne trois
// choses qu'un simple `play()` ne donne pas :
//
//   - le RYTHME propre à chaque chute (on vacille, on s'écroule vite, on reste
//     à terre longtemps, on se relève lentement) alors que le clip d'origine
//     tient en une seconde ;
//   - le TEMPS AU SOL, en tenant le clip sur sa dernière image ;
//   - le RELEVÉ, en repassant le clip à l'envers - un corps qui ramène ses
//     jambes sous lui et se hisse, ce qu'aucun pack ne fournit.
//
// Les temps sont calés sur les bruitages (systems/audioEngine, paxFall/paxSlip) :
// l'impact tombe avec le `thud`, le relevé avec le froissement de tissu.

import type { PaxAction } from '../../data/paxActions';
import type { LogicalClip } from './manifest';

/** Piste de clés : [temps depuis le début de l'action (s), position 0..1 dans le clip]. */
type Track = readonly (readonly [number, number])[];

interface FallCut {
  clip: LogicalClip;
  keys: Track;
  /** Fondu d'entrée : une chute part sec, on n'a pas 250 ms à perdre. */
  fadeIn: number;
  /** Fondu de sortie vers l'idle, une fois le voyageur remis sur ses pieds. */
  fadeOut: number;
}

const FALL_CUTS: Partial<Record<PaxAction, FallCut>> = {
  // Chute complète (rame). Impact au sol à 0,55 s - le `thud` de paxFall ;
  // départ du relevé à 2,80 s - son froissement de tissu ; debout à 4,0 s,
  // dans la plus courte des durées du catalogue (4,2 s).
  //
  // Le milieu du clip, repris à l'envers, donne l'assise par terre - jambes
  // devant, buste en arrière sur les mains - qu'aucun pack n'anime : c'est
  // elle qui fait la chute plutôt que le plongeon, et qui laisse au voyageur
  // le temps de regarder autour de lui, penaud.
  fall: {
    clip: 'collapse',
    keys: [
      [0.0, 0.0], // debout
      [0.18, 0.07], // il vacille : le clip démarre à peine
      [0.55, 0.66], // les jambes lâchent, le dos touche
      [0.9, 1.0], // le corps se tasse, les bras retombent
      [1.6, 1.0], // étalé, le temps de comprendre ce qui vient d'arriver
      [2.15, 0.45], // il se redresse sur son séant
      [2.45, 0.41], // …et se repose : le buste cherche son équilibre
      [2.8, 0.43], // assis par terre, il regarde autour de lui
      [3.15, 0.33], // il ramène ses jambes sous lui
      [3.55, 0.18], // il se hisse
      [3.85, 0.05],
      [4.0, 0.0], // debout, penaud
    ],
    fadeIn: 0.1,
    fadeOut: 0.3,
  },
  // Faux pas rattrapé (rame) : le recul encaissé du pack, ralenti d'un quart.
  // La fin de l'action est laissée au regard gêné de paxMotion.
  stumble: {
    clip: 'stagger',
    keys: [
      [0.0, 0.0],
      [0.2, 0.3], // le buste part
      [0.45, 0.62], // le pied recule pour rattraper
      [0.85, 1.0], // il se redresse
    ],
    fadeIn: 0.08,
    fadeOut: 0.28,
  },
  // Glissade (quai) : le pied part, il descend jusqu'à mi-hauteur - choc à
  // 0,35 s, le `thud` de paxSlip - puis se rattrape sans toucher le sol.
  // Le clip de chute repassé à l'envers EST ce rattrapage.
  slip: {
    clip: 'collapse',
    keys: [
      [0.0, 0.0],
      [0.14, 0.06], // le pied glisse
      [0.35, 0.3], // il descend sur ses talons
      [0.6, 0.26], // il tient
      [1.1, 0.08], // il se redresse
      [1.4, 0.0],
    ],
    fadeIn: 0.07,
    fadeOut: 0.26,
  },
};

/**
 * Écart de cap donné à une chute pilotée par clip.
 *
 * Le clip tombe toujours droit en arrière : sans ça, les six chutes d'un tour
 * de boucle seraient rigoureusement la même. On fait donc pivoter le voyageur
 * pendant qu'il perd l'équilibre, du côté que l'action a déjà tiré au sort
 * (`lookYawTarget`, ±1) - il part en arrière ET de biais, comme quand on se
 * rattrape d'un pied.
 */
export function fallYawOffset(side: number, fallW: number): number {
  return (side >= 0 ? 0.42 : -0.42) * fallW;
}

/** Clip que cette action irait chercher dans le pack, null si ce n'est pas une chute. */
export function fallClipFor(action: PaxAction): LogicalClip | null {
  return FALL_CUTS[action]?.clip ?? null;
}

export interface FallCue {
  clip: LogicalClip;
  /** Position dans le clip, 0..1 (1 = dernière image). */
  u: number;
  fadeIn: number;
  fadeOut: number;
}

const cue: FallCue = { clip: 'collapse', u: 0, fadeIn: 0.1, fadeOut: 0.3 };

/**
 * Position du clip de chute pour l'action courante, ou null si l'action n'est
 * pas une chute (ou si elle a dépassé sa dernière clé : le voyageur est debout,
 * l'idle reprend la main).
 *
 * L'objet renvoyé est réutilisé d'un appel à l'autre - à consommer sur place.
 */
export function fallCue(action: PaxAction, actionT: number): FallCue | null {
  const cut = FALL_CUTS[action];
  if (!cut) return null;
  const keys = cut.keys;
  const last = keys[keys.length - 1];
  if (actionT >= last[0]) return null;
  let u = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, u1] = keys[i];
    if (actionT < t1) {
      const [t0, u0] = keys[i - 1];
      const span = t1 - t0;
      u = span > 1e-4 ? u0 + ((u1 - u0) * (actionT - t0)) / span : u1;
      break;
    }
    u = u1;
  }
  cue.clip = cut.clip;
  cue.u = u;
  cue.fadeIn = cut.fadeIn;
  cue.fadeOut = cut.fadeOut;
  return cue;
}
