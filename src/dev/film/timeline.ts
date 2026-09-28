// Chronologie du film vertical : l'ordre et la durée des plans.
//
// Partagée par le réalisateur (dev/film/director), qui tourne les plans, et par
// l'habillage (dev/film/overlay-main), qui pose les textes dessus : les deux
// doivent tomber à l'image près sur les mêmes coupes.

export const TIMELINE = [
  { name: 'arrivee', dur: 2.8 },
  { name: 'distributeur', dur: 3.9 },
  { name: 'monter', dur: 3.4 },
  { name: 'assis', dur: 3.8 },
  { name: 'ecran', dur: 2.4 },
  { name: 'fenetre', dur: 3.8 },
  { name: 'soir', dur: 3.9 },
] as const;

export type ShotName = (typeof TIMELINE)[number]['name'];

export const FPS = 30;

/** Durée d'un plan (s). */
export function durOf(name: ShotName): number {
  return TIMELINE.find((s) => s.name === name)!.dur;
}

/** Instant (s) où commence un plan dans le film monté. */
export function startOf(name: ShotName): number {
  let t = 0;
  for (const s of TIMELINE) {
    if (s.name === name) return t;
    t += s.dur;
  }
  throw new Error(name);
}

/** Durée totale du film (s). */
export const TOTAL = TIMELINE.reduce((a, s) => a + s.dur, 0);

/**
 * Heure affichée à l'image, en minutes : c'est la même courbe que celle que
 * le réalisateur impose au jeu pendant l'accéléré de la fenêtre.
 */
export const DUSK = { from: 16 * 60 + 50, to: 19 * 60 + 30 };
